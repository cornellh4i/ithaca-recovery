import { Role } from '@prisma/client';
import { after } from 'next/server';
import { requireRole } from '../../../../services/auth';
import { getETDayBounds } from '../../../../util/date/timeUtils';
import {
  deleteCalendarEvent,
  deleteCalendarOccurrence,
  trimCalendarEventSeries,
  calendarIdsForMeeting,
} from '../../../../services/googleCalendar';
import { deleteZoomMeeting, zoomRoomCalendarId } from '../../../../services/zoom';
import { reconcilePendingResume, tearDownPendingResumeSeries, MeetingWithSuspensions } from '../../../../util/meetings/suspension';
import { prisma } from '../../../../lib/prisma';

// Returns "YYYY-MM-DD" in Eastern Time for the given UTC timestamp.
const toETDateStr = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

// The three sync* functions below all run after the response is sent (see the
// after() calls in each branch) — no googleSyncStatus field to reconcile for deletes,
// so errors are just logged, not written back anywhere.
async function syncDeleteOccurrence(
  accessToken: string | undefined,
  calendarIds: Record<string, string>,
  eventIds: Record<string, string>,
  startDateTime: Date,
  occurrenceDate: string,
): Promise<void> {
  if (!accessToken) return;
  for (const [cat, calId] of Object.entries(calendarIds)) {
    const eventId = eventIds[cat];
    if (eventId) await deleteCalendarOccurrence(accessToken, eventId, startDateTime, occurrenceDate, calId);
  }
}

async function syncTrimSeries(
  accessToken: string | undefined,
  calendarIds: Record<string, string>,
  eventIds: Record<string, string>,
  occurrenceDate: string,
): Promise<void> {
  if (!accessToken) return;
  for (const [cat, calId] of Object.entries(calendarIds)) {
    const eventId = eventIds[cat];
    if (eventId) await trimCalendarEventSeries(accessToken, eventId, occurrenceDate, calId);
  }
}

async function syncDeleteAll(
  accessToken: string | undefined,
  calendarIds: Record<string, string>,
  eventIds: Record<string, string>,
  meeting: MeetingWithSuspensions,
): Promise<void> {
  if (accessToken) {
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const eventId = eventIds[cat];
      if (eventId) await deleteCalendarEvent(accessToken, eventId, calId);
    }
  }
  // Any future resume series pre-created by a suspend/reschedule that never got promoted into
  // the live pointer above would otherwise be left dangling on Google Calendar once the meeting
  // itself is gone.
  await tearDownPendingResumeSeries(meeting, accessToken);
  // Never delete an unmanaged Zoom meeting (adopted legacy / externally hosted): the group's
  // meeting ID predates this app and must survive the app-side record's deletion. A managed
  // Zoom meeting can also be shared by a sibling row (one group, two schedule variants -- e.g.
  // the Sat-hybrid/Sun-remote pairs), so it's only torn down once no other live row points at it.
  if (meeting.zid && meeting.zoomManaged) {
    const siblingCount = await prisma.meeting.count({
      where: { zid: meeting.zid, deletedAt: null, mid: { not: meeting.mid } },
    });
    if (siblingCount === 0) await deleteZoomMeeting(meeting.zid);
  }
  if (accessToken && meeting.zoomCalendarEventId && meeting.zoomRoom) {
    const calId = zoomRoomCalendarId[meeting.zoomRoom];
    if (calId) await deleteCalendarEvent(accessToken, meeting.zoomCalendarEventId, calId);
  }
}

const deleteMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const body = await request.json();
    const { mid, deleteOption, occurrenceDate } = body;

    const meeting = await prisma.meeting.findUnique({
      where: { mid },
      include: { recurrencePattern: true, suspensions: true }
    });

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Lazy self-heal, same as update/meeting/route.ts -- promote a due-but-unpromoted scheduled
    // resume series before deleting whatever's currently in googleCalendarEventIds.
    meeting.googleCalendarEventIds = await reconcilePendingResume(meeting);

    const isRecurring = !!meeting.recurrencePattern || meeting.isRecurring;

    if (isRecurring && !deleteOption) {
      return new Response(JSON.stringify({ error: "Delete option is required for recurring meetings" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (isRecurring && !['this', 'thisAndFollowing', 'all'].includes(deleteOption)) {
      return new Response(JSON.stringify({ error: "Invalid delete option" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if ((deleteOption === 'this' || deleteOption === 'thisAndFollowing') && !occurrenceDate) {
      return new Response(JSON.stringify({ error: "occurrenceDate is required for this delete option" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Google Calendar sync — fire before or alongside MongoDB changes; errors are logged, not thrown
    const accessToken = auth.accessToken;
    const calendarIds = calendarIdsForMeeting(meeting.calType ?? []);
    const eventIds = (meeting.googleCalendarEventIds ?? {}) as Record<string, string>;

    // Verified atomic: each branch below is exactly one top-level Mongo write (recurrencePattern
    // update, recurrencePattern update, or meeting update) -- no unwrapped multi-write gap to
    // fix here, unlike write/meeting/route.ts's create path.
    if (deleteOption === 'this') {
      if (!meeting.recurrencePattern) {
        return new Response(JSON.stringify({ error: "Meeting has no recurrence pattern" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // MongoDB: record excluded date
      const etDateStr = toETDateStr(new Date(occurrenceDate));
      const [excludedDate] = getETDayBounds(etDateStr);
      await prisma.recurrencePattern.update({
        where: { mid },
        data: { excludedDates: { push: excludedDate } },
      });
      // Google Calendar: add EXDATE for this occurrence on each calendar
      after(syncDeleteOccurrence(accessToken, calendarIds, eventIds, meeting.startDateTime, occurrenceDate));
    } else if (deleteOption === 'thisAndFollowing') {
      if (!meeting.recurrencePattern) {
        return new Response(JSON.stringify({ error: "Meeting has no recurrence pattern" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // MongoDB: trim the series end date
      const etDateStr = toETDateStr(new Date(occurrenceDate));
      const [occurrenceUTCStart] = getETDayBounds(etDateStr);
      const newEndDate = new Date(occurrenceUTCStart.getTime() - 1);
      await prisma.recurrencePattern.update({
        where: { mid },
        data: { endDate: newEndDate },
      });
      // A pending resume series pre-created for a scheduled suspension (see
      // createPendingResumeSeries) only makes sense if the recurring series still reaches that
      // far -- trimming the series to end before the suspension's scheduled resume date would
      // otherwise leave that series' events dangling on Google Calendar, describing occurrences
      // the series no longer generates.
      const hasStaleResumeSeries = meeting.suspensions.some(
        (s) => !s.promoted && s.resumeEventIds && s.to && s.to.getTime() > newEndDate.getTime(),
      );
      if (hasStaleResumeSeries) after(tearDownPendingResumeSeries(meeting, accessToken));
      // Google Calendar: trim RRULE UNTIL on each calendar
      after(syncTrimSeries(accessToken, calendarIds, eventIds, occurrenceDate));
    } else {
      // 'all' or non-recurring: soft-delete the master meeting record
      await prisma.meeting.update({
        where: { mid },
        data: { deletedAt: new Date() },
      });
      // Google Calendar + Zoom: whole-series delete — 'this'/'thisAndFollowing' leave Zoom untouched
      after(syncDeleteAll(accessToken, calendarIds, eventIds, meeting));
    }

    return new Response(JSON.stringify({ message: "Meeting deleted successfully" }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error deleting meeting: ", error);
    return new Response(JSON.stringify({ error: "Failed to delete meeting" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export { deleteMeeting as DELETE };
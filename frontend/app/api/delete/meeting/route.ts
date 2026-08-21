import { Role } from '@prisma/client';
import { after } from 'next/server';
import { requireRole } from '../../../../services/auth';
import { getETDayBounds } from '../../../../util/date/timeUtils';
import {
  deleteCalendarEvent,
  updateCalendarEvent,
  calendarIdsForMeeting,
} from '../../../../services/googleCalendar';
import { IMeeting } from '../../../../types/models';
import { deleteZoomMeeting, zoomRoomCalendarId } from '../../../../services/zoom';
import { reconcilePendingResume, tearDownPendingResumeSeries, MeetingWithSuspensions } from '../../../../util/meetings/suspension';
import { prisma } from '../../../../lib/prisma';

// Returns "YYYY-MM-DD" in Eastern Time for the given UTC timestamp.
const toETDateStr = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

// Runs after the response is sent — full-body rewrite of each configured calType calendar
// event to match the meeting's POST-WRITE RecurrencePattern (buildEventBody now serializes
// excludedDates as EXDATE lines and endDate as UNTIL itself, so a plain events.update with the
// already-mutated pattern is sufficient; no more surgical EXDATE/UNTIL patch needed for a
// 'this'/'thisAndFollowing' delete), plus the meeting's OWN Zoom-Room join-link event (if it has
// one) -- previously a partial delete never touched it at all, leaving it describing an
// occurrence 'this' had just excluded (or a tail 'thisAndFollowing' had just trimmed away).
// Mirrors how that event was created (write/meeting's syncNewMeeting): same calendar
// (zoomRoomCalendarId[zoomRoom]), same locationOverride (the join link). Skipped for a currently
// suspended meeting -- its live GCal recurrence already carries a suspension-only UNTIL trim
// (syncSuspend in update/meeting/suspend/route.ts, via trimCalendarEventSeries) that isn't
// represented in RecurrencePattern at all, and a full-body rewrite from the stored pattern would
// silently resurrect whatever the suspension hid. Persists googleSyncStatus/googleSyncError so a
// failed rewrite gets the ⚠ badge/retry prompt instead of silently leaving DB and Google
// disagreeing about the exclusion/trim that already committed -- same contract as every other
// Google write (technical-decisions.md's "API failure ⇒ googleSyncStatus 'error'"). The
// suspended early-return above deliberately skips this write too -- that deferral is intentional
// (status stays whatever it already was), not a failure to report. 'all'/whole-series delete
// (syncDeleteAll below) stays fire-and-log -- the row is soft-deleted, there's no meeting left
// for a status badge to attach to.
async function syncPartialDelete(
  mid: string,
  status: string,
  accessToken: string | undefined,
  calendarIds: Record<string, string>,
  eventIds: Record<string, string>,
  meetingForCalendar: IMeeting,
  zoomCalendarEventId: string | null,
  zoomRoom: string | null,
): Promise<void> {
  if (!accessToken || status === 'Suspended') return;
  let synced = true;
  let syncError: string | null = null;
  for (const [cat, calId] of Object.entries(calendarIds)) {
    const eventId = eventIds[cat];
    if (!eventId) continue;
    const { ok, error } = await updateCalendarEvent(accessToken, eventId, meetingForCalendar, calId);
    if (!ok) {
      synced = false;
      syncError = syncError ?? error ?? "Failed to update the calendar event.";
    }
  }
  // A null zoomLink here would fall back to buildEventBody's street-address default as this
  // event's `location` (see the locationOverride comment there) -- publishing that onto a
  // Zoom-Room calendar breaks the room hardware's one-touch join detection, which keys off a
  // real Zoom URL. Only rewrite when there's still a real link to publish.
  if (zoomCalendarEventId && zoomRoom && meetingForCalendar.zoomLink) {
    const calId = zoomRoomCalendarId[zoomRoom];
    if (calId) {
      const { ok, error } = await updateCalendarEvent(accessToken, zoomCalendarEventId, meetingForCalendar, calId, meetingForCalendar.zoomLink);
      if (!ok) {
        synced = false;
        syncError = syncError ?? error ?? "Failed to update the Zoom-Room calendar event.";
      }
    }
  }
  await prisma.meeting.update({
    where: { mid },
    data: { googleSyncStatus: synced ? 'synced' : 'error', googleSyncError: synced ? null : syncError },
  });
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
      const updatedPattern = await prisma.recurrencePattern.update({
        where: { mid },
        data: { excludedDates: { push: excludedDate } },
      });
      // Google Calendar: full-body rewrite from the post-write pattern -- buildEventBody now
      // serializes excludedDates as EXDATE lines itself, so this new exclusion (and every prior
      // one) lands on the calendar in one events.update per configured cat-cal event.
      after(syncPartialDelete(
        mid, meeting.status, accessToken, calendarIds, eventIds,
        { ...meeting, recurrencePattern: updatedPattern } as unknown as IMeeting,
        meeting.zoomCalendarEventId, meeting.zoomRoom,
      ));
    } else if (deleteOption === 'thisAndFollowing') {
      if (!meeting.recurrencePattern) {
        return new Response(JSON.stringify({ error: "Meeting has no recurrence pattern" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // MongoDB: trim the series end date. numberOfOccurrences is explicitly nulled here -- a
      // count-bounded series left with a stale count would have that count win back over the
      // just-written endDate the next time toRRule serializes it (see toRRule's endDate-wins
      // comment), silently un-trimming the series the next time a whole-series edit resubmits
      // the stored count and recomputes an endDate past this trim point.
      const etDateStr = toETDateStr(new Date(occurrenceDate));
      const [occurrenceUTCStart] = getETDayBounds(etDateStr);
      const newEndDate = new Date(occurrenceUTCStart.getTime() - 1);
      const updatedPattern = await prisma.recurrencePattern.update({
        where: { mid },
        data: { endDate: newEndDate, numberOfOccurrences: null },
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
      // Google Calendar: full-body rewrite from the post-write (trimmed) pattern -- buildEventBody
      // regenerates the RRULE's UNTIL from RecurrencePattern.endDate itself.
      after(syncPartialDelete(
        mid, meeting.status, accessToken, calendarIds, eventIds,
        { ...meeting, recurrencePattern: updatedPattern } as unknown as IMeeting,
        meeting.zoomCalendarEventId, meeting.zoomRoom,
      ));
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
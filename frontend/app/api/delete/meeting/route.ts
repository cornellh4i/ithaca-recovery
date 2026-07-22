import { Meeting, Role } from '@prisma/client';
import { waitUntil } from '@vercel/functions';
import { requireRole } from '../../../../services/auth';
import { getETDayBounds } from '../../../../util/timeUtils';
import {
  deleteCalendarEvent,
  deleteCalendarOccurrence,
  trimCalendarEventSeries,
  calendarIdsForMeeting,
} from '../../../../services/googleCalendar';
import { deleteZoomMeeting, zoomRoomCalendarId } from '../../../../services/zoom';
import { prisma } from '../../../../lib/prisma';

// Returns "YYYY-MM-DD" in Eastern Time for the given UTC timestamp.
const toETDateStr = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

// The three sync* functions below all run after the response is sent (see the
// waitUntil calls in each branch) — no syncStatus field to reconcile for deletes,
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
  meeting: Meeting,
): Promise<void> {
  if (accessToken) {
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const eventId = eventIds[cat];
      if (eventId) await deleteCalendarEvent(accessToken, eventId, calId);
    }
  }
  if (meeting.zid) await deleteZoomMeeting(meeting.zid);
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
      include: { recurrencePattern: true }
    });

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
      waitUntil(syncDeleteOccurrence(accessToken, calendarIds, eventIds, meeting.startDateTime, occurrenceDate));
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
      // Google Calendar: trim RRULE UNTIL on each calendar
      waitUntil(syncTrimSeries(accessToken, calendarIds, eventIds, occurrenceDate));
    } else {
      // 'all' or non-recurring: soft-delete the master meeting record
      await prisma.meeting.update({
        where: { mid },
        data: { deletedAt: new Date() },
      });
      // Google Calendar + Zoom: whole-series delete — 'this'/'thisAndFollowing' leave Zoom untouched
      waitUntil(syncDeleteAll(accessToken, calendarIds, eventIds, meeting));
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
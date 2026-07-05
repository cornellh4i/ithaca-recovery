import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/authConfig';
import { getETDayBounds } from '../../../../util/timeUtils';
import {
  deleteCalendarEvent,
  deleteCalendarOccurrence,
  trimCalendarEventSeries,
  calendarIdsForMeeting,
} from '../../../../services/googleCalendar';

const prisma = new PrismaClient();

// Returns "YYYY-MM-DD" in Eastern Time for the given UTC timestamp.
const toETDateStr = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

const deleteMeeting = async (request: Request) => {
  try {
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
    const session = await getServerSession(authOptions);
    const accessToken = session?.accessToken;
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
      if (accessToken) {
        for (const [cat, calId] of Object.entries(calendarIds)) {
          const eventId = eventIds[cat];
          if (eventId) await deleteCalendarOccurrence(accessToken, eventId, meeting.startDateTime, occurrenceDate, calId);
        }
      }
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
      if (accessToken) {
        for (const [cat, calId] of Object.entries(calendarIds)) {
          const eventId = eventIds[cat];
          if (eventId) await trimCalendarEventSeries(accessToken, eventId, occurrenceDate, calId);
        }
      }
    } else {
      // 'all' or non-recurring: soft-delete the master meeting record
      await prisma.meeting.update({
        where: { mid },
        data: { deletedAt: new Date() },
      });
      // Google Calendar: delete from each calendar
      if (accessToken) {
        for (const [cat, calId] of Object.entries(calendarIds)) {
          const eventId = eventIds[cat];
          if (eventId) await deleteCalendarEvent(accessToken, eventId, calId);
        }
      }
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
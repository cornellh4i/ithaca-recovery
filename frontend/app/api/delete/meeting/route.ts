import { PrismaClient } from '@prisma/client';
import { getETDayBounds } from '../../../../util/timeUtils';

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

    if (deleteOption === 'this') {
      if (!meeting.recurrencePattern) {
        return new Response(JSON.stringify({ error: "Meeting has no recurrence pattern" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const etDateStr = toETDateStr(new Date(occurrenceDate));
      const [excludedDate] = getETDayBounds(etDateStr);
      await prisma.recurrencePattern.update({
        where: { mid },
        data: { excludedDates: { push: excludedDate } },
      });
    } else if (deleteOption === 'thisAndFollowing') {
      if (!meeting.recurrencePattern) {
        return new Response(JSON.stringify({ error: "Meeting has no recurrence pattern" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Set endDate to 1ms before the UTC start of the occurrence's ET day,
      // so the day route's `localDate > endDate` check excludes it and all following dates.
      const etDateStr = toETDateStr(new Date(occurrenceDate));
      const [occurrenceUTCStart] = getETDayBounds(etDateStr);
      const newEndDate = new Date(occurrenceUTCStart.getTime() - 1);
      await prisma.recurrencePattern.update({
        where: { mid },
        data: { endDate: newEndDate },
      });
    } else {
      // 'all' or non-recurring: soft-delete the master meeting record
      await prisma.meeting.update({
        where: { mid },
        data: { deletedAt: new Date() },
      });
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
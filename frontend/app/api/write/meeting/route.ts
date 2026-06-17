import { IMeeting } from '../../../../util/models';
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/authConfig";
import { createCalendarEvent } from "../../../../services/googleCalendar";

const prisma = new PrismaClient();

const createMeeting = async (request: Request) => {
  try {
    const meetingData = await request.json() as IMeeting;

    const { recurrencePattern, ...meetingDetails } = meetingData;

    const newMeeting = await prisma.meeting.create({
      data: {
        ...meetingDetails,
        isRecurring: !!recurrencePattern
      }
    });

    let responseMeeting: object = newMeeting;

    if (recurrencePattern) {
      let calculatedEndDate = recurrencePattern.endDate;

      if (recurrencePattern.numberOfOccurrences && !recurrencePattern.endDate) {
        calculatedEndDate = calculateEndDateFromOccurrences(
          recurrencePattern.startDate,
          recurrencePattern.daysOfWeek || [],
          recurrencePattern.numberOfOccurrences,
          recurrencePattern.interval || 1
        );
      }

      await prisma.recurrencePattern.create({
        data: {
          mid: newMeeting.mid,
          type: recurrencePattern.type,
          startDate: recurrencePattern.startDate,
          endDate: calculatedEndDate,
          numberOfOccurences: recurrencePattern.numberOfOccurrences,
          daysOfWeek: recurrencePattern.daysOfWeek || [],
          firstDayOfWeek: recurrencePattern.firstDayOfWeek || "Sunday",
          interval: recurrencePattern.interval || 1
        }
      });

      const meetingWithRecurrence = await prisma.meeting.findUnique({
        where: { id: newMeeting.id },
        include: { recurrencePattern: true }
      });

      responseMeeting = meetingWithRecurrence ?? newMeeting;
    }

    // Google Calendar sync — non-blocking: failure sets syncStatus but does not fail the request
    const session = await getServerSession(authOptions);
    if (session?.accessToken) {
      const meetingForCalendar: IMeeting = { ...meetingData, isRecurring: !!recurrencePattern };
      const gcalEventId = await createCalendarEvent(session.accessToken, meetingForCalendar);
      await prisma.meeting.update({
        where: { mid: newMeeting.mid },
        data: {
          googleCalendarEventId: gcalEventId ?? undefined,
          syncStatus: gcalEventId ? 'synced' : 'error',
        },
      });
    }

    return new Response(JSON.stringify(responseMeeting), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

/**
 * Calculate the end date based on a specific number of occurrences
 */
function calculateEndDateFromOccurrences(
  startDate: Date,
  daysOfWeek: string[],
  numberOfOccurrences: number,
  interval: number
): Date {
  const patternStartDate = new Date(startDate);

  if (daysOfWeek.length === 0 || numberOfOccurrences <= 0) {
    return patternStartDate;
  }

  const dayNameToIndex: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6
  };

  const recurrenceDays = daysOfWeek
    .map(day => dayNameToIndex[day])
    .filter(index => index !== undefined)
    .sort((a, b) => a - b);

  if (recurrenceDays.length === 0) {
    return patternStartDate;
  }

  const endDate = new Date(patternStartDate);

  let occurrenceCount = 0;
  let currentWeek = 0;

  const startDayOfWeek = patternStartDate.getUTCDay();

  if (recurrenceDays.includes(startDayOfWeek)) {
    occurrenceCount++;

    if (occurrenceCount >= numberOfOccurrences) {
      return patternStartDate;
    }
  }

  let nextDayIndex = recurrenceDays.findIndex(day => day > startDayOfWeek);

  if (nextDayIndex === -1) {
    nextDayIndex = 0;
    currentWeek++;
  }

  while (occurrenceCount < numberOfOccurrences) {
    if (currentWeek % interval === 0) {
      while (nextDayIndex < recurrenceDays.length) {
        const daysToAdd = (currentWeek * 7) +
          (recurrenceDays[nextDayIndex] - startDayOfWeek + 7) % 7;

        endDate.setUTCDate(patternStartDate.getUTCDate() + daysToAdd);
        occurrenceCount++;
        nextDayIndex++;

        if (occurrenceCount >= numberOfOccurrences) {
          return endDate;
        }
      }
    }

    currentWeek++;
    nextDayIndex = 0;
  }

  return endDate;
}

export { createMeeting as POST };

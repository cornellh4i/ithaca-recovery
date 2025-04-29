import { IMeeting } from '../../../../util/models';
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

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

    if (recurrencePattern) {
      // Calculate end date based on the recurrence pattern (DOES NOT ACCOUNT FOR THE DAY ITS CREATED IF NOT A RECURRENCE)
      let calculatedEndDate = recurrencePattern.endDate;
      
      if (recurrencePattern.numberOfOccurences && !recurrencePattern.endDate) {
        calculatedEndDate = calculateEndDateFromOccurrences(
          recurrencePattern.startDate,
          recurrencePattern.daysOfWeek || [],
          recurrencePattern.numberOfOccurences,
          recurrencePattern.interval || 1
        );
      }

      await prisma.recurrencePattern.create({
        data: {
          mid: newMeeting.mid, 
          type: recurrencePattern.type,
          startDate: recurrencePattern.startDate,
          endDate: calculatedEndDate,
          numberOfOccurences: recurrencePattern.numberOfOccurences,
          daysOfWeek: recurrencePattern.daysOfWeek || [],
          firstDayOfWeek: recurrencePattern.firstDayOfWeek || "Sunday",
          interval: recurrencePattern.interval || 1
        }
      });

      const meetingWithRecurrence = await prisma.meeting.findUnique({
        where: { id: newMeeting.id },
        include: { recurrencePattern: true }
      });

      return new Response(JSON.stringify(meetingWithRecurrence), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify(newMeeting), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

/**
 * Calculate the end date based on a specific number of occurrences
 * @param startDate The start date of the recurrence pattern
 * @param daysOfWeek Array of days on which the meeting recurs
 * @param numberOfOccurences The number of occurrences after which to end
 * @param interval The interval between recurrences (e.g., 1 = every week, 2 = every other week)
 * @returns The calculated end date
 */
function calculateEndDateFromOccurrences(
  startDate: Date, 
  daysOfWeek: string[], 
  numberOfOccurences: number,
  interval: number
): Date {
  const patternStartDate = new Date(startDate);
  
  if (daysOfWeek.length === 0 || numberOfOccurences <= 0) {
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
    
    if (occurrenceCount >= numberOfOccurences) {
      return patternStartDate;
    }
  }
  
  let nextDayIndex = recurrenceDays.findIndex(day => day > startDayOfWeek);
  
  if (nextDayIndex === -1) {
    nextDayIndex = 0; 
    currentWeek++;    
  }
  
  while (occurrenceCount < numberOfOccurences) {
    if (currentWeek % interval === 0) {
      while (nextDayIndex < recurrenceDays.length) {
        const daysToAdd = (currentWeek * 7) + 
          (recurrenceDays[nextDayIndex] - startDayOfWeek + 7) % 7;
        
        endDate.setUTCDate(patternStartDate.getUTCDate() + daysToAdd);
        occurrenceCount++;
        nextDayIndex++;
        
        if (occurrenceCount >= numberOfOccurences) {
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
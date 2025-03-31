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
      await prisma.recurrencePattern.create({
        data: {
          meetingId: newMeeting.id, 
          type: recurrencePattern.type,
          startDate: recurrencePattern.startDate,
          endDate: recurrencePattern.endDate,
          numberOfOccurences: recurrencePattern.numberOfOccurrences,
          daysOfWeek: recurrencePattern.daysOfWeek || [],
          firstDayOfWeek: recurrencePattern.firstDayOfWeek || "Sunday",
          interval: recurrencePattern.interval
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

export { createMeeting as POST };
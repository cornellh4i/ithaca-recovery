import { IMeeting } from '../../../../util/models';
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const createMeeting = async (request: Request) => {
  try {
    const meetingData = await request.json() as IMeeting;
    
    const { recurrencePattern, ...meetingDetails } = meetingData;

    const data = {
      ...meetingDetails,
      isRecurring: !!recurrencePattern,
      ...(recurrencePattern ? {
        recurrenceType: recurrencePattern.type,
        recurrenceInterval: recurrencePattern.interval,
        recurrenceStartDate: recurrencePattern.startDate,
        recurrenceEndDate: recurrencePattern.endDate,
        recurrenceOccurrences: recurrencePattern.numberOfOccurrences,
        recurrenceDaysOfWeek: recurrencePattern.daysOfWeek || [],
        recurrenceFirstDay: recurrencePattern.firstDayOfWeek || "Sunday"
      } : {})
    };

    const newMeeting = await prisma.meeting.create({
      data
    });

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
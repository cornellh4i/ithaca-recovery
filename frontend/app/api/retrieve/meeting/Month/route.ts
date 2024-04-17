import { PrismaClient } from '@prisma/client';
import { IMeeting } from "../../../../../util/models";

const prisma = new PrismaClient();

export const retrieveMonthMeetings = async (request: Request) => {
  try {
    const { date } = await request.json();
    const standardDate = new Date(date);
    const month = standardDate.getUTCMonth();
    const nextMonthStart = month + 1;

    const startDate = new Date(Date.UTC(standardDate.getUTCFullYear(), month, 1))
    const endDate = new Date(Date.UTC(standardDate.getUTCFullYear(), nextMonthStart, 0, 23, 59, 59, 999))

    const meetings = await prisma.meeting.findMany({
      where: {
        startDateTime: {
          gte: startDate,
        },
        endDateTime: {
          lte: endDate,
        }
      }
    })
    const typedMeetings: IMeeting[] = meetings.map(meeting => ({ ...meeting }))
    return new Response(JSON.stringify(typedMeetings), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  }
  catch (error) {
    console.error("Error retrieving meetings: ", error);
    return new Response(JSON.stringify({ error: "Error retrieving meetings" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export { retrieveMonthMeetings as GET }
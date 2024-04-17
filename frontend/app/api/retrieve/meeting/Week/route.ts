import { PrismaClient } from '@prisma/client';
import { start } from 'repl';
import { IMeeting } from "../../../../../util/models";


const prisma = new PrismaClient();


export const retrieveWeekMeetings = async (request: Request) => {
  try {
    const { date } = await request.json();
    const standardDate = new Date(date)
    const startDate = new Date(Date.UTC(standardDate.getUTCFullYear(), standardDate.getUTCMonth(), (standardDate.getUTCDate() - standardDate.getUTCDay())))
    const endDate = new Date(Date.UTC(standardDate.getUTCFullYear(), standardDate.getUTCMonth(), (standardDate.getUTCDate() + (6 - standardDate.getUTCDay())), 23, 59, 59, 999))
    const meetings = await prisma.meeting.findMany({
      where: {
        startDateTime: {
          gte: startDate,
        },
        endDateTime: {
          lte: endDate
        }
      }
    }
    );

    const typedMeetings: IMeeting[] = meetings.map(meeting => ({ ...meeting }))
    return new Response(JSON.stringify(typedMeetings), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error retrieving meetings: ", error);
    return new Response(JSON.stringify({ error: "Error retrieving meetings" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export { retrieveWeekMeetings as GET }
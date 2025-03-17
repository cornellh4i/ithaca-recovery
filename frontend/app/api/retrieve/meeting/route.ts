import { IMeeting } from "../../../../util/models";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const retrieveMeetings = async (request: Request) => {
  try {
    const meetings = await prisma.meeting.findMany();
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

const fetchMeetings = async () => {
  try {
    const meetings = await prisma.meeting.findMany();
    const typedMeetings: IMeeting[] = meetings.map(meeting => ({ ...meeting }))
    typedMeetings.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
    return typedMeetings;
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

export { fetchMeetings, retrieveMeetings as GET }
import { IMeeting } from "../../../../util/models";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const retrieveMeetings = async () => {
  try {
    const meetings = await prisma.meeting.findMany({ where: notDeleted });
    const typedMeetings: IMeeting[] = meetings.map(meeting => ({
      ...meeting,
      googleCalendarEventIds: (meeting.googleCalendarEventIds ?? {}) as Record<string, string>,
    }))
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

export { retrieveMeetings as GET }
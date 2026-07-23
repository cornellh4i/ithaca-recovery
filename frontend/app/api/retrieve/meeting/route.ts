import { prisma } from "../../../../lib/prisma";
import { toPublicMeeting } from "../../../../util/publicMeeting";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const retrieveMeetings = async () => {
  try {
    const meetings = await prisma.meeting.findMany({ where: notDeleted });
    const publicMeetings = meetings.map(toPublicMeeting);
    return new Response(JSON.stringify(publicMeetings), {
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
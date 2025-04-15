import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

const prisma = new PrismaClient();
const getMeeting = async(request: NextRequest) => {
  try {
    const mid = request.nextUrl.pathname.split('/').pop() as string;
    console.log("Requested meeting ID:", mid);

    const meeting = await prisma.meeting.findUnique({
      where: {
        mid: String(mid),
      },
      include: {
        recurrencePattern: true,
      },
    });

    if (!meeting) {
      return new Response(JSON.stringify({ error: `Meeting not found` }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify(meeting), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error retrieving meeting: ", error);
    return new Response(JSON.stringify({ error: `Error retrieving meeting` }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};

export {getMeeting as GET};

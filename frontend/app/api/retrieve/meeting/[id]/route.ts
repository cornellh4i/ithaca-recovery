import { NextRequest } from "next/server";
import { getAuth } from "../../../../../services/auth";
import { prisma } from "../../../../../lib/prisma";
import { toPublicMeeting } from "../../../../../util/publicMeeting";
const getMeeting = async(request: NextRequest) => {
  try {
    // Intentionally public (see routeGuards.test.ts PUBLIC_ROUTES) -- backs the
    // unauthenticated calendar's detail panel. Callers without a session get only the
    // public-safe fields; a valid session (any role) gets the full record, same as before.
    const session = await getAuth();

    const mid = request.nextUrl.pathname.split('/').pop() as string;
    console.log("Requested meeting ID:", mid);

    const meeting = await prisma.meeting.findFirst({
      where: {
        AND: [{ mid: String(mid) }, { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }],
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

    const body = session?.user?.role
      ? meeting
      : toPublicMeeting({ ...meeting, recurrencePattern: meeting.recurrencePattern ?? null });

    return new Response(JSON.stringify(body), {
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

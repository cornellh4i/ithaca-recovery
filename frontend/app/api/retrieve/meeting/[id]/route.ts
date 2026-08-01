import { NextRequest } from "next/server";
import { getAuth } from "../../../../../services/auth";
import { prisma } from "../../../../../lib/prisma";
import { toPublicMeeting } from "../../../../../util/publicMeeting";
import { getUnresolvedSuspension } from "../../../../../util/suspension";
import { formatETDateString } from "../../../../../util/timeUtils";
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
        suspensions: true,
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

    // resumesAt/suspendedSince: the most recent unresolved suspension's scheduled resume date
    // and its own start date, if any (null = no suspension at all) -- includes one scheduled to
    // start later, not just one already hiding the meeting today, so the UI can show it's
    // pending. suspensionActive distinguishes "hidden from the calendar right now" from
    // "scheduled, but from hasn't arrived yet" -- lets the UI show "Suspend"/"Reactivate"/"Cancel
    // scheduled suspension" correctly without exposing the full suspension history to the client.
    const todayStr = formatETDateString(new Date());
    const relevantSuspension = getUnresolvedSuspension(meeting, todayStr);
    const suspensionActive = relevantSuspension ? formatETDateString(relevantSuspension.from) <= todayStr : false;
    const body = session?.user?.role
      ? {
          ...meeting,
          resumesAt: relevantSuspension?.to ?? null,
          suspendedSince: relevantSuspension?.from ?? null,
          suspensionActive,
        }
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

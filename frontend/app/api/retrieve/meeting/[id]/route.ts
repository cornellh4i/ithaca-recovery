import { NextRequest } from "next/server";
import { getAuth } from "../../../../../services/auth";
import { prisma } from "../../../../../lib/prisma";
import { toPublicMeeting } from "../../../../../util/meetings/publicMeeting";
import { getUnresolvedSuspension } from "../../../../../util/meetings/suspension";
import { isSharedZoomScheduleCompatible } from "../../../../../util/meetings/sharedZoomSchedule";
import { isDetachedSplitChild } from "../../../../../util/meetings/linkedSchedules";
import { formatETDateString } from "../../../../../util/date/timeUtils";
const getMeeting = async(request: NextRequest) => {
  try {
    // Intentionally public (see routeGuards.test.ts PUBLIC_ROUTES) -- backs the
    // unauthenticated calendar's detail panel. Callers without a session, or a USER-role
    // session, get only the public-safe fields; ADMIN/SUPER_ADMIN sessions get the full
    // record. This gate has to hold here, not just in the UI (BUG-022) -- see
    // util/meetings/publicMeeting.ts.
    const session = await getAuth();

    const mid = request.nextUrl.pathname.split('/').pop() as string;

    const meeting = await prisma.meeting.findFirst({
      where: {
        mid: String(mid),
        deletedAt: null,
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
    // suspensions itself is never sent to the client -- resumesAt/suspendedSince/suspensionActive
    // above already derive everything the UI needs from it, and the full history (including
    // internal fields like resumeEventIds) isn't meant to be public API surface.
    const { suspensions: _suspensions, ...meetingWithoutSuspensions } = meeting;
    const isAdminSession = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";

    // A few legacy Zoom meetings serve more than one platform row (one shared zid, union
    // schedule on Zoom). Admins need to know before editing that the schedule they're changing
    // feeds a link another meeting also uses, and whether Zoom is currently waiting on the
    // sibling to match. Admin-only (BUG-022): the sibling's title/mode is never public.
    const siblings = isAdminSession && meeting.zid
      ? await prisma.meeting.findMany({
          where: { zid: meeting.zid, deletedAt: null, mid: { not: meeting.mid } },
          select: {
            title: true, modeType: true, isRecurring: true, splitFromMid: true,
            startDateTime: true, endDateTime: true,
            recurrencePattern: { select: { type: true, interval: true } },
          },
        })
      : [];
    // A "This event" split-off child has no representation in Zoom's single schedule at all --
    // it's a one-off, not a second weekly slot -- so it must never count toward this divergence
    // signal. Filtered out here, not in isSharedZoomScheduleCompatible itself: that function's
    // "incompatible" answer for such a row is still the correct input to the schedule-neutral
    // PATCH decision in services/zoom.ts, which is a different question (can Zoom's PATCH
    // represent this row at all) than "is there a genuine, user-visible divergence to warn
    // about." Without this, a detached child would permanently pin zoomScheduleDiverged to true
    // with no way to ever clear it. Same predicate the family label excludes by, so the two can
    // never disagree about what counts as a detached one-off.
    const scheduleRelevantRows = [meeting, ...siblings].filter((row) => !isDetachedSplitChild(row));
    const sharedZoom = siblings.length > 0
      ? {
          sharedWith: siblings.map(({ title, modeType }) => ({ title, modeType })),
          zoomScheduleDiverged: !isSharedZoomScheduleCompatible(scheduleRelevantRows),
        }
      : {};

    const body = isAdminSession
      ? {
          ...meetingWithoutSuspensions,
          resumesAt: relevantSuspension?.to ?? null,
          suspendedSince: relevantSuspension?.from ?? null,
          suspensionActive,
          ...sharedZoom,
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

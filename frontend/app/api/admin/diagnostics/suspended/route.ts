import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { getUnresolvedSuspension } from "../../../../../util/meetings/suspension";
import { formatETDateString } from "../../../../../util/date/timeUtils";
import { prisma } from "../../../../../lib/prisma";

const notDeleted = { deletedAt: null };

// Diagnostics Suspended panel: meetings currently suspended, or with a suspension scheduled
// for a future date. Split out from the old combined /api/admin/diagnostics route so this
// panel can load/refresh independently of the others (e.g. resuming a meeting only needs to
// refetch this panel).
export const GET = async () => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const meetings = await prisma.meeting.findMany({
      where: notDeleted,
      select: {
        mid: true, title: true, group: true, room: true, modeType: true, calType: true,
        updatedAt: true, suspensions: true,
      },
    });

    const todayStr = formatETDateString(new Date());

    // Derived from `meetings` (already fetched above) rather than a separate `status:
    // "Suspended"` query -- that flag can drift from the date-based truth (e.g. a
    // client-supplied `status` written by the update route), and a status pre-filter combined
    // with `take` before the date filter could silently undercount/omit currently-suspended
    // rows. Uses getUnresolvedSuspension (not isDateSuspended-today) so a suspension scheduled
    // to start on a future date shows up here too, not just ones already hiding the meeting.
    const suspendedOrPending = meetings
      .map((m) => {
        const suspension = getUnresolvedSuspension(m, todayStr);
        return suspension ? { meeting: m, suspension } : null;
      })
      .filter((x): x is { meeting: typeof meetings[number]; suspension: NonNullable<ReturnType<typeof getUnresolvedSuspension>> } => x !== null);

    const suspendedMeetings = suspendedOrPending
      .sort((a, b) => (b.meeting.updatedAt?.getTime() ?? 0) - (a.meeting.updatedAt?.getTime() ?? 0))
      .slice(0, 20)
      .map(({ meeting: m, suspension }) => ({
        mid: m.mid, title: m.title, group: m.group, room: m.room,
        modeType: m.modeType, calType: m.calType, updatedAt: m.updatedAt,
        resumesAt: suspension.to,
        suspendedSince: suspension.from,
        suspensionActive: formatETDateString(suspension.from) <= todayStr,
      }));

    // total is the uncapped count of suspendedOrPending -- suspendedMeetings itself is sliced to
    // the 20 most recently updated, so the panel's header count can't just use
    // suspendedMeetings.length once that cap is hit. Note this is not the same number as Meeting
    // Counts' "suspended" figure: that one uses isDateSuspended (suspended as of today only),
    // while suspendedOrPending here also includes suspensions scheduled to start in the future.
    return NextResponse.json({ suspendedMeetings, total: suspendedOrPending.length });
  } catch (error) {
    console.error("Error retrieving suspended meetings: ", error);
    return NextResponse.json({ error: "Error retrieving suspended meetings" }, { status: 500 });
  }
};

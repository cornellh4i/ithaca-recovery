import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { computeConflicts } from "../../../../util/resourceOverlap";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

// Admin-only: which meetings currently have an unresolved room/zoomRoom/zoomHost conflict --
// backs the Day/Week calendar's conflict badge (see BoxText's hasConflict prop). Deliberately
// not folded into the public day/week retrieve routes (util/publicMeeting.ts's allowlist) --
// a Zoom-host conflict is an internal resourcing detail, not something a public viewer needs
// to see, matching the existing precedent that conflicts are otherwise only surfaced in
// Diagnostics (also admin-only). Kept separate from the full /api/admin/diagnostics route so
// the calendar's periodic refresh doesn't also re-check GCal/Zoom reachability and the host
// pool on every poll.
export const GET = async () => {
  const auth = await requireRole(Role.ADMIN);
  if (auth instanceof Response) return auth;

  const meetings = await prisma.meeting.findMany({
    where: notDeleted,
    select: {
      mid: true, title: true, room: true, zoomRoom: true, zoomHost: true, status: true,
      calType: true, startDateTime: true, endDateTime: true, isRecurring: true, recurrencePattern: true,
    },
  });

  const conflicts = computeConflicts(meetings);
  const mids = new Set<string>();
  conflicts.forEach((row) => row.meetings.forEach((m) => mids.add(m.mid)));

  return NextResponse.json({ mids: Array.from(mids) });
};

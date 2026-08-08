import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { computeConflicts } from "../../../../../util/resourceOverlap";
import { prisma } from "../../../../../lib/prisma";

const notDeleted = { deletedAt: null };

// Diagnostics Conflicts panel: meetings that share a room, Zoom room, or Zoom host at
// overlapping times. Split out from the old combined /api/admin/diagnostics route so this
// panel can load/refresh independently of the others.
export const GET = async () => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const meetings = await prisma.meeting.findMany({
      where: notDeleted,
      select: {
        mid: true, title: true, room: true, zoomRoom: true, zoomHost: true,
        attemptedZoomHost: true, status: true, calType: true, suspensions: true,
        startDateTime: true, endDateTime: true, isRecurring: true, recurrencePattern: true,
      },
    });

    return NextResponse.json({ conflicts: computeConflicts(meetings) });
  } catch (error) {
    console.error("Error retrieving conflicts: ", error);
    return NextResponse.json({ error: "Error retrieving conflicts" }, { status: 500 });
  }
};

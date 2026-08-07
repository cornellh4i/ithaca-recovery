import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { prisma } from "../../../../../lib/prisma";

const notDeleted = { deletedAt: null };

// Diagnostics Sync Issues panel: meetings that failed to sync to Zoom or Google Calendar, or
// are waiting on a Zoom host. Split out from the old combined /api/admin/diagnostics route so
// retrying a sync issue only needs to refetch this panel, not the other four.
export const GET = async () => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const meetings = await prisma.meeting.findMany({
      where: notDeleted,
      select: {
        mid: true, title: true, group: true, modeType: true, calType: true, room: true,
        googleSyncStatus: true, zoomSyncStatus: true, zoomSyncError: true, updatedAt: true,
      },
    });

    // Which specific meetings are behind the zoomSyncErrors/pendingZoomSync counts on the
    // Meeting Counts panel -- the counts alone give no way to find and fix the actual meeting.
    // A meeting can carry both a pending-host wait and (independently) a Zoom error, so this
    // collects whichever of the two apply per meeting rather than picking one.
    const syncIssues = meetings
      .map((m) => {
        const needsZoom = m.modeType === "Hybrid" || m.modeType === "Remote";
        const issues: string[] = [];
        if (m.googleSyncStatus === "pending") {
          issues.push("Waiting on a Zoom host to become available — calendars not yet published.");
        } else if (m.googleSyncStatus === "error") {
          issues.push("Google Calendar sync failed.");
        }
        if (needsZoom && m.zoomSyncStatus === "error") {
          issues.push(m.zoomSyncError ? `Zoom sync failed: ${m.zoomSyncError}` : "Zoom sync failed.");
        }
        return issues.length > 0
          ? { mid: m.mid, title: m.title, group: m.group, room: m.room, modeType: m.modeType, calType: m.calType, issues, updatedAt: m.updatedAt }
          : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      .slice(0, 50);

    return NextResponse.json({ syncIssues });
  } catch (error) {
    console.error("Error retrieving sync issues: ", error);
    return NextResponse.json({ error: "Error retrieving sync issues" }, { status: 500 });
  }
};

import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { calendarIdForCategory } from "../../../../../services/googleCalendar";
import { isDateSuspended } from "../../../../../util/meetingOccurrences";
import { formatETDateString } from "../../../../../util/timeUtils";
import { prisma } from "../../../../../lib/prisma";

const notDeleted = { deletedAt: null };

// Diagnostics Meeting Counts panel: total/active/suspended, per-category, recurring/one-time,
// and sync-error/pending-Zoom-host counts. Split out from the old combined
// /api/admin/diagnostics route so this panel can load/refresh independently of the others.
export const GET = async () => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const meetings = await prisma.meeting.findMany({
      where: notDeleted,
      select: {
        calType: true, isRecurring: true, googleSyncStatus: true, zoomSyncStatus: true,
        modeType: true, suspensions: true,
      },
    });

    const todayStr = formatETDateString(new Date());
    const categories = Object.keys(calendarIdForCategory);
    const byCategory: Record<string, number> = {};
    categories.forEach((cat) => { byCategory[cat] = 0; });
    let active = 0;
    let suspended = 0;
    let recurring = 0;
    let gcalSyncErrors = 0;
    let zoomSyncErrors = 0;
    let pendingZoomSync = 0;
    for (const m of meetings) {
      if (isDateSuspended(m.suspensions, todayStr)) suspended++; else active++;
      if (m.isRecurring) recurring++;
      for (const cat of m.calType) {
        if (cat in byCategory) byCategory[cat]++;
      }
      if (m.googleSyncStatus === "error") gcalSyncErrors++;
      // Despite the Google-prefixed field, a pending googleSyncStatus here means the meeting
      // is waiting on a Zoom host pick, not a Google Calendar write -- same rule sync-issues/
      // route.ts uses for its "Waiting on a Zoom host" label.
      if (m.googleSyncStatus === "pending") pendingZoomSync++;
      // mode-based, not zoomRoom-truthy -- Remote meetings need Zoom too but no longer have
      // a zoomRoom, so gating this on zoomRoom would silently stop counting their errors.
      const needsZoom = m.modeType === "Hybrid" || m.modeType === "Remote";
      if (needsZoom && m.zoomSyncStatus === "error") zoomSyncErrors++;
    }

    return NextResponse.json({
      total: meetings.length,
      active,
      suspended,
      byCategory,
      recurring,
      oneTime: meetings.length - recurring,
      gcalSyncErrors,
      zoomSyncErrors,
      pendingZoomSync,
    });
  } catch (error) {
    console.error("Error retrieving meeting counts: ", error);
    return NextResponse.json({ error: "Error retrieving meeting counts" }, { status: 500 });
  }
};

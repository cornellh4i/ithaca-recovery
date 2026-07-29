import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { calendarIdForCategory, checkCalendarReachable } from "../../../../services/googleCalendar";
import { checkZoomReachable, zoomRoomCalendarId, checkZoomHostPool } from "../../../../services/zoom";
import { computeConflicts } from "../../../../util/resourceOverlap";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

// Diagnostics for the Admin page's Diagnostics tab: DB health, GCal reachability per
// category, Zoom account reachability, per-room Zoom calendar validity, per-host Zoom pool
// validity (host existence and licensed-vs-basic status), meeting counts (incl. sync-error
// counts), room/Zoom-room conflicts, and a list of currently suspended meetings.
export const GET = async () => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const dbStart = Date.now();
    await prisma.admin.count();
    const databaseLatencyMs = Date.now() - dbStart;

    const categories = Object.keys(calendarIdForCategory);
    const googleCalendarCategories: Record<string, boolean> = {};
    if (auth.accessToken) {
      await Promise.all(categories.map(async (cat) => {
        googleCalendarCategories[cat] = await checkCalendarReachable(auth.accessToken as string, calendarIdForCategory[cat]);
      }));
    } else {
      categories.forEach((cat) => { googleCalendarCategories[cat] = false; });
    }

    const zoomReachable = await checkZoomReachable();

    const zoomRooms = Object.keys(zoomRoomCalendarId);
    const roomCalendars: Record<string, boolean> = {};
    if (auth.accessToken) {
      await Promise.all(zoomRooms.map(async (room) => {
        roomCalendars[room] = await checkCalendarReachable(auth.accessToken as string, zoomRoomCalendarId[room]);
      }));
    } else {
      zoomRooms.forEach((room) => { roomCalendars[room] = false; });
    }

    const hostPool = await checkZoomHostPool();

    const meetings = await prisma.meeting.findMany({
      where: notDeleted,
      select: {
        mid: true, title: true, status: true, calType: true, isRecurring: true,
        syncStatus: true, zoomRoom: true, zoomSyncStatus: true, room: true, modeType: true,
        startDateTime: true, endDateTime: true, recurrencePattern: true,
      },
    });

    const byCategory: Record<string, number> = {};
    categories.forEach((cat) => { byCategory[cat] = 0; });
    let active = 0;
    let suspended = 0;
    let recurring = 0;
    let gcalSyncErrors = 0;
    let zoomSyncErrors = 0;
    let pendingZoomSync = 0;
    for (const m of meetings) {
      if (m.status === "Suspended") suspended++; else active++;
      if (m.isRecurring) recurring++;
      for (const cat of m.calType) {
        if (cat in byCategory) byCategory[cat]++;
      }
      if (m.syncStatus === "error") gcalSyncErrors++;
      if (m.syncStatus === "pending") pendingZoomSync++;
      // mode-based, not zoomRoom-truthy -- Remote meetings need Zoom too but no longer have
      // a zoomRoom, so gating this on zoomRoom would silently stop counting their errors.
      const needsZoom = m.modeType === "Hybrid" || m.modeType === "Remote";
      if (needsZoom && m.zoomSyncStatus === "error") zoomSyncErrors++;
    }

    const suspendedMeetings = await prisma.meeting.findMany({
      where: { ...notDeleted, status: "Suspended" },
      select: { mid: true, title: true, group: true, room: true, modeType: true, calType: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      database: { ok: true, latencyMs: databaseLatencyMs },
      googleCalendar: { categories: googleCalendarCategories },
      zoom: { reachable: zoomReachable, roomCalendars, hostPool },
      session: { email: auth.user?.email ?? null, role: auth.user?.role ?? null },
      meetingCounts: {
        total: meetings.length,
        active,
        suspended,
        byCategory,
        recurring,
        oneTime: meetings.length - recurring,
        gcalSyncErrors,
        zoomSyncErrors,
        pendingZoomSync,
      },
      conflicts: computeConflicts(meetings),
      suspendedMeetings,
    });
  } catch (error) {
    console.error("Error retrieving diagnostics: ", error);
    return NextResponse.json(
      { database: { ok: false, latencyMs: null }, error: "Error retrieving diagnostics" },
      { status: 500 },
    );
  }
};

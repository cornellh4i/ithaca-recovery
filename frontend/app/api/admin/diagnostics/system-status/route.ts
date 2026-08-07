import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { calendarIdForCategory, checkCalendarReachable } from "../../../../../services/googleCalendar";
import { checkZoomReachable, zoomRoomCalendarId, checkZoomHostPool } from "../../../../../services/zoom";
import { prisma } from "../../../../../lib/prisma";

// Diagnostics System Status panel: DB health, GCal reachability per category, Zoom account
// reachability, per-room Zoom calendar validity, per-host Zoom pool validity (host existence
// and licensed-vs-basic status), and the current session. Split out from the old combined
// /api/admin/diagnostics route so this panel's own external-reachability checks (the most
// expensive part) can load/refresh independently of the other Diagnostics panels.
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

    return NextResponse.json({
      database: { ok: true, latencyMs: databaseLatencyMs },
      googleCalendar: { categories: googleCalendarCategories },
      zoom: { reachable: zoomReachable, roomCalendars, hostPool },
      session: { email: auth.user?.email ?? null, role: auth.user?.role ?? null },
    });
  } catch (error) {
    console.error("Error retrieving system status: ", error);
    return NextResponse.json(
      { database: { ok: false, latencyMs: null }, error: "Error retrieving system status" },
      { status: 500 },
    );
  }
};

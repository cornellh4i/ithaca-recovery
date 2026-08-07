import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { calendarIdForCategory, checkCalendarReachable } from "../../../../../services/googleCalendar";
import { checkZoomReachable, zoomRoomCalendarId, zoomHostPool, checkZoomHostPool } from "../../../../../services/zoom";
import { prisma } from "../../../../../lib/prisma";

const CHECK_TIMEOUT_MS = 8000;

// Bounds an external check's contribution to this route's total latency -- without this, one
// slow/hung Google or Zoom response holds the whole request (and the connection) open
// indefinitely, since none of the underlying fetches in services/zoom.ts /
// services/googleCalendar.ts pass an abort signal. Resolves to `fallback` (the same
// shape a real "unreachable" result would have) rather than rejecting, so callers don't need
// their own try/catch for the timeout case.
function withTimeout<T>(promise: Promise<T>, fallback: T, ms = CHECK_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Built as an array first, in `ids`' own key order, then assembled into an object in one pass
// -- object key order otherwise follows whichever check happens to resolve first, which varies
// run to run (SystemStatusCard.tsx renders these via Object.entries(), so insertion order is
// what determines on-screen row order).
async function reachableMap(ids: Record<string, string>, token: string | undefined): Promise<Record<string, boolean>> {
  const keys = Object.keys(ids);
  if (!token) return Object.fromEntries(keys.map((k) => [k, false]));
  const results = await Promise.all(keys.map((k) => withTimeout(checkCalendarReachable(token, ids[k]), false)));
  return Object.fromEntries(keys.map((k, i) => [k, results[i]]));
}

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

    const token = auth.accessToken as string | undefined;
    const unreachableHostPool = Object.fromEntries(zoomHostPool.map((email) => [email, { ok: false, licensed: null }]));

    // All four independent external-check groups run together instead of sequentially --
    // previously the route awaited each in turn, so the total latency was their sum.
    const [googleCalendarCategories, zoomReachable, roomCalendars, hostPool] = await Promise.all([
      reachableMap(calendarIdForCategory, token),
      withTimeout(checkZoomReachable(), false),
      reachableMap(zoomRoomCalendarId, token),
      withTimeout(checkZoomHostPool(), unreachableHostPool),
    ]);

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

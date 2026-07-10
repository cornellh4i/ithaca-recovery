import { PrismaClient, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { calendarIdForCategory, checkCalendarReachable } from "../../../../services/googleCalendar";

const prisma = new PrismaClient();

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

// Diagnostics for the Admin page's Diagnostics tab: DB health, GCal reachability per
// category, meeting counts, and a list of currently suspended meetings. Conflict
// detection is stubbed (empty) until Ticket B.5's overlap-detection endpoint lands.
export const GET = async (request: Request) => {
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

    const meetings = await prisma.meeting.findMany({
      where: notDeleted,
      select: { status: true, calType: true, isRecurring: true },
    });

    const byCategory: Record<string, number> = {};
    categories.forEach((cat) => { byCategory[cat] = 0; });
    let active = 0;
    let suspended = 0;
    let recurring = 0;
    for (const m of meetings) {
      if (m.status === "Suspended") suspended++; else active++;
      if (m.isRecurring) recurring++;
      for (const cat of m.calType) {
        if (cat in byCategory) byCategory[cat]++;
      }
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
      session: { email: auth.user?.email ?? null, role: auth.user?.role ?? null },
      meetingCounts: {
        total: meetings.length,
        active,
        suspended,
        byCategory,
        recurring,
        oneTime: meetings.length - recurring,
      },
      conflicts: [],
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

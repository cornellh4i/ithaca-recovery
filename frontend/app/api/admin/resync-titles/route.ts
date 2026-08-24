import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";
import { syncOneMeeting } from "../../../../services/syncOneMeeting";
import { buildLinkedScheduleLabel, fellowshipPrefixedTitle, linkedFamilyLoader } from "../../../../util/meetings/linkedSchedules";

// Batch-size ceiling: every executed row is up to several external calls (Zoom PATCH +
// credential/invitation fetches + one calendar write per configured category), so a batch is
// kept small enough to stay inside Zoom's rate limits and one serverless invocation's budget.
const MAX_BATCH = 25;

const requestSchema = z.object({
  // Preview is the default: execution rewrites external services and must be asked for
  // explicitly with dryRun: false.
  dryRun: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(MAX_BATCH).optional().default(10),
  cursor: z.string().optional(),
  // Scope the sweep to specific meetings (e.g. re-running rows a previous batch reported
  // failures for) instead of walking the whole table.
  mids: z.array(z.string()).max(MAX_BATCH).optional(),
});

/**
 * Admin sweep that pushes every live meeting's external names to the current title format
 * (the fellowship prefix rollout). Idempotent: each executed row runs the same full
 * reconcile "Retry sync" uses (services/syncOneMeeting.ts), so a pinned zoomTopic keeps its
 * verbatim Zoom name and an unmanaged meeting is never PATCHed -- only their calendar events
 * are rewritten. Paginated by mid; callers walk nextCursor until it is null.
 */
const resyncTitles = async (request: Request): Promise<Response> => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;
    if (!auth.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
    }
    const { dryRun, limit, cursor, mids } = parsed.data;

    // Only rows with an external presence to rename. Suspended meetings keep their events
    // deliberately absent (syncOneMeeting no-ops on them anyway); they pick the format up on
    // resume/next edit instead.
    const meetings = await prisma.meeting.findMany({
      where: {
        deletedAt: null,
        status: { not: "Suspended" },
        OR: [
          { zid: { not: null } },
          { googleCalendarEventId: { not: null } },
          { googleSyncStatus: "synced" },
        ],
        ...(mids ? { mid: { in: mids } } : cursor ? { mid: { gt: cursor } } : {}),
      },
      orderBy: { mid: "asc" },
      take: limit,
      include: { recurrencePattern: true },
    });

    const results = [];
    for (const meeting of meetings) {
      // The same family the services would name the row's events after.
      const family = await linkedFamilyLoader(prisma, meeting.mid)(meeting.zid);
      const row = { ...meeting, recurrencePattern: meeting.recurrencePattern ?? null };
      const newTitle = buildLinkedScheduleLabel(fellowshipPrefixedTitle(row), row, family);
      const base = {
        mid: meeting.mid,
        title: meeting.title,
        newTitle,
        // A pinned topic keeps its verbatim Zoom name; only the calendar events get newTitle.
        pinnedZoomTopic: meeting.zoomTopic,
        zoomManaged: meeting.zoomManaged,
      };
      if (dryRun) {
        results.push(base);
      } else {
        const sync = await syncOneMeeting(meeting.mid, auth.accessToken);
        results.push({ ...base, ...(sync.notFound ? { error: "not found" } : sync) });
      }
    }

    return NextResponse.json({
      dryRun,
      results,
      nextCursor: !mids && meetings.length === limit ? meetings[meetings.length - 1].mid : null,
    });
  } catch (error) {
    console.error("resync-titles error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { resyncTitles as POST };

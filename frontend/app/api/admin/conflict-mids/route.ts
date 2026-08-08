import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { computeConflicts } from "../../../../util/meetings/resourceOverlap";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { deletedAt: null };

// The Day/Week calendar polls this every 30s (see page.tsx's refresh interval) for every admin
// viewer, but computeConflicts recomputes the full conflict graph (pairwise overlap over every
// meeting's expanded occurrences) from scratch -- a short TTL means back-to-back polls across
// admins/tabs within the window share one computation instead of each re-running it.
// Module-scope, so it only helps within a single warm server instance -- fine here since a
// stale-by-at-most-CACHE_TTL_MS badge is a cosmetic lag, not a correctness issue.
const CACHE_TTL_MS = 15_000;
let cache: { expiresAt: number; mids: string[]; counts: Record<string, number> } | null = null;

// Admin-only: which meetings currently have an unresolved room/zoomRoom/zoomHost conflict --
// backs the Day/Week calendar's conflict badge (see BoxText's hasConflict prop). Deliberately
// not folded into the public day/week retrieve routes (util/publicMeeting.ts's allowlist) --
// a Zoom-host conflict is an internal resourcing detail, not something a public viewer needs
// to see, matching the existing precedent that conflicts are otherwise only surfaced in
// Diagnostics (also admin-only). Kept separate from /api/admin/diagnostics/conflicts so the
// calendar's periodic refresh doesn't share a route (and its cache) with Diagnostics -- the two
// compute the same conflict list independently, on their own schedules.
export const GET = async () => {
  const auth = await requireRole(Role.ADMIN);
  if (auth instanceof Response) return auth;

  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json({ mids: cache.mids, counts: cache.counts });
  }

  const meetings = await prisma.meeting.findMany({
    where: notDeleted,
    select: {
      mid: true, title: true, room: true, zoomRoom: true, zoomHost: true, attemptedZoomHost: true,
      status: true, calType: true, startDateTime: true, endDateTime: true, isRecurring: true,
      recurrencePattern: true, suspensions: true,
    },
  });

  const conflicts = computeConflicts(meetings);
  // Per-mid set of the *other* mids it conflicts with, deduped across rows -- a meeting can
  // appear in more than one conflict row (e.g. both a room conflict and a separate zoomHost
  // conflict), so this is a union, not a raw row count.
  const conflictingWith = new Map<string, Set<string>>();
  conflicts.forEach((row) => {
    const [a, b] = row.meetings;
    if (!conflictingWith.has(a.mid)) conflictingWith.set(a.mid, new Set());
    if (!conflictingWith.has(b.mid)) conflictingWith.set(b.mid, new Set());
    conflictingWith.get(a.mid)!.add(b.mid);
    conflictingWith.get(b.mid)!.add(a.mid);
  });

  const result = Array.from(conflictingWith.keys());
  const counts: Record<string, number> = {};
  conflictingWith.forEach((others, mid) => { counts[mid] = others.size; });
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, mids: result, counts };

  return NextResponse.json({ mids: result, counts });
};

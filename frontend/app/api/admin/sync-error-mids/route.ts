import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";

// Admin-only: which meetings currently have a Google Calendar or Zoom sync error -- backs the
// Day/Week calendar's sync-error badge (see BoxText's syncError prop). Mirrors
// /api/admin/conflict-mids exactly (same admin gate, same mids-by-lookup shape) rather than
// folding this into the public day/week retrieve routes (util/meetings/publicMeeting.ts's
// allowlist) -- googleSyncStatus/zoomSyncStatus are deliberately excluded from PublicMeeting
// (see that file's comment, BUG-022) since ViewMeeting's admin-only status band must not leak
// them to an unauthenticated viewer. The calendar block's badge needs the same admin gate, just
// enforced here instead, so a public/non-admin viewer's calendar never renders it either.
export const GET = async () => {
  const auth = await requireRole(Role.ADMIN);
  if (auth instanceof Response) return auth;

  const meetings = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      OR: [{ googleSyncStatus: "error" }, { zoomSyncStatus: "error" }],
    },
    select: { mid: true },
  });

  return NextResponse.json({ mids: meetings.map((m) => m.mid) });
};

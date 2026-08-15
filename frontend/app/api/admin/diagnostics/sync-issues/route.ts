import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { prisma } from "../../../../../lib/prisma";

const notDeleted = { deletedAt: null };

// A meeting whose deferred sync job never even started (e.g. the request crashed before
// `after()` ran) or crashed before writing any status leaves googleSyncStatus at its default
// `null` forever, which nothing else here flags as a problem. Guarded by this staleness window
// so a meeting that's mid-flight (its deferred job just hasn't reached its write yet) isn't
// misreported as broken.
//
// Known limitation: `updatedAt` is used as the "last touched" signal because Meeting has no
// dedicated createdAt/lastSyncAttemptAt field. Any unrelated edit (suspend/resume, promotion,
// a plain field edit) bumps updatedAt too, which resets this staleness window -- a genuinely
// stuck sync can be masked for a while by an unrelated later edit. A dedicated timestamp would
// close this gap but is a bigger schema change than this fix warrants.
const NEVER_ATTEMPTED_STALE_MS = 5 * 60 * 1000;

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
        mid: true, title: true, group: true, modeType: true, calType: true, room: true, status: true,
        googleSyncStatus: true, zoomSyncStatus: true, zoomSyncError: true, updatedAt: true,
      },
    });

    // Which specific meetings are behind the zoomSyncErrors/pendingZoomSync counts on the
    // Meeting Counts panel -- the counts alone give no way to find and fix the actual meeting.
    // A meeting can carry both a pending-host wait and (independently) a Zoom error, so this
    // collects whichever of the two apply per meeting rather than picking one. Severity is
    // returned as structured data (not left for the card to infer from the message text) so a
    // future wording change here can't silently break which style a row renders with.
    const allSyncIssues = meetings
      .map((m) => {
        const needsZoom = m.modeType === "Hybrid" || m.modeType === "Remote";
        const issues: { text: string; severity: "warning" | "danger" }[] = [];
        if (m.googleSyncStatus === "pending") {
          issues.push({ text: "Waiting on a Zoom host to become available — calendars not yet published.", severity: "warning" });
        } else if (m.googleSyncStatus === "error") {
          issues.push({ text: "Google Calendar sync failed.", severity: "danger" });
        } else if (
          m.googleSyncStatus === null &&
          m.calType.length > 0 &&
          // syncNewMeeting/syncUpdatedMeeting (write/update routes) early-return for a
          // Suspended meeting by design, without touching googleSyncStatus -- suspend/resume
          // routes do write a (non-null) status in some cases, but a meeting created or last
          // edited while already Suspended can go through its whole lifecycle without ever
          // passing through one of those writes, leaving googleSyncStatus permanently null.
          // That's expected for this status, not a stuck job.
          m.status !== "Suspended" &&
          Date.now() - (m.updatedAt?.getTime() ?? 0) > NEVER_ATTEMPTED_STALE_MS
        ) {
          issues.push({ text: "Google Calendar sync was never attempted for this meeting.", severity: "danger" });
        }
        if (needsZoom && m.zoomSyncStatus === "error") {
          issues.push({ text: m.zoomSyncError ? `Zoom sync failed: ${m.zoomSyncError}` : "Zoom sync failed.", severity: "danger" });
        }
        return issues.length > 0
          ? { mid: m.mid, title: m.title, group: m.group, room: m.room, modeType: m.modeType, calType: m.calType, issues, updatedAt: m.updatedAt }
          : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));

    // total is the uncapped count -- syncIssues itself is sliced to the 50 most recently
    // updated, so the panel's header count can't just use syncIssues.length once that cap is
    // hit (same pattern as the suspended route).
    const syncIssues = allSyncIssues.slice(0, 50);

    return NextResponse.json({ syncIssues, total: allSyncIssues.length });
  } catch (error) {
    console.error("Error retrieving sync issues: ", error);
    return NextResponse.json({ error: "Error retrieving sync issues" }, { status: 500 });
  }
};

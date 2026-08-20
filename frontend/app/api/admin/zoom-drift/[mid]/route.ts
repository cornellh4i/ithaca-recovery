import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { getZoomMeetingCredentials } from "../../../../../services/zoom";
import { prisma } from "../../../../../lib/prisma";

// Admin-only: does this meeting's live Zoom passcode/join URL differ from the stored copy?
// Backs ViewMeeting's drift notice on the sync-status band. One Zoom GET per request is fine
// here (a single meeting, opened by an admin) but must never move onto the calendar retrieve
// paths -- those fetch meetings in bulk on the public hot path (cf. the Conflicts-endpoint
// timeout, PR #500). Resolution is the existing retry-sync route, which adopts the live
// credentials before republishing.
export const GET = async (request: NextRequest) => {
  const auth = await requireRole(Role.ADMIN);
  if (auth instanceof Response) return auth;

  const mid = request.nextUrl.pathname.split("/").pop() as string;
  const meeting = await prisma.meeting.findFirst({
    where: { mid, deletedAt: null },
    select: { zid: true, zoomLink: true, zoomPasscode: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!meeting.zid) {
    return NextResponse.json({ drift: false });
  }

  // Fail quiet on an unreachable/missing Zoom meeting -- that's a sync failure's territory
  // (surfaced by the existing error badge when a write actually fails), not drift.
  const live = await getZoomMeetingCredentials(meeting.zid);
  if (!live?.joinUrl) {
    return NextResponse.json({ drift: false });
  }

  // live.passcode is already ""-normalized to null (getZoomMeetingCredentials); the stored
  // side gets the same treatment so a null-vs-"" pairing never reads as permanent drift.
  const drift =
    live.joinUrl !== meeting.zoomLink ||
    live.passcode !== (meeting.zoomPasscode || null);
  return NextResponse.json({ drift });
};

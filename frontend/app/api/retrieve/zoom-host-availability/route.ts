import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { checkZoomHostPoolAvailability } from "../../../../services/zoom";
import { zoomHostAvailabilityCheckSchema } from "../../../../util/meetings/meetingValidation";

// Body is the same IMeeting-shaped object useMeetingForm's buildMeetingPayload() already
// produces for the real create/update submit -- no separate client-side date/recurrence
// conversion. zod strips the extra keys (title/email/etc.) this narrower schema doesn't need.
export const POST = async (request: Request) => {
  const auth = await requireRole(Role.ADMIN);
  if (auth instanceof Response) return auth;

  const parsed = zoomHostAvailabilityCheckSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const { mid, ...candidate } = parsed.data;
  const hosts = await checkZoomHostPoolAvailability(candidate, { excludeMid: mid });

  return NextResponse.json({ hosts });
};

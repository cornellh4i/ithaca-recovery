import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { zoomHostPool } from "../../../../services/zoom";

// ADMIN-gated (not public) -- the pool is a list of real licensed Zoom account emails, and
// zoomHost is deliberately excluded from util/publicMeeting.ts's public allowlist, so an
// unauthenticated caller never has a reason to need this either.
export const GET = async () => {
  const auth = await requireRole(Role.ADMIN);
  if (auth instanceof Response) return auth;

  return NextResponse.json({ hosts: zoomHostPool });
};

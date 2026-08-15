import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { sanitizeMeetingExportFields } from "../../../../util/meetings/meetingExportFields";
import { MEETING_EXPORT_SETTINGS_ID } from "../../../../util/settings/singletonIds";
import { prisma } from "../../../../lib/prisma";

// Singleton settings row, enforced by upserting on the fixed id (see schema.prisma) rather
// than a read-then-create -- that race could otherwise create two rows under concurrent
// initial writes.
export const PUT = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const body = await request.json() as { fields?: unknown };
    if (body.fields !== undefined && !Array.isArray(body.fields)) {
      return NextResponse.json({ error: "fields must be an array." }, { status: 400 });
    }
    // Sanitized, not trusted as-is -- drops anything that isn't a currently-known field key
    // (e.g. a stale client sending a since-removed key).
    const fields = sanitizeMeetingExportFields((body.fields as string[] | undefined) ?? []);

    const saved = await prisma.meetingExportSettings.upsert({
      where: { id: MEETING_EXPORT_SETTINGS_ID },
      update: { fields },
      create: { id: MEETING_EXPORT_SETTINGS_ID, fields },
    });

    return NextResponse.json({ fields: saved.fields });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { sanitizeMeetingExportFields } from "../../../../util/meetingExportFields";
import { prisma } from "../../../../lib/prisma";

// Singleton settings row — updates the existing row if one exists, else creates it.
export const PUT = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const body = await request.json() as { fields: string[] };
    // Sanitized, not trusted as-is -- drops anything that isn't a currently-known field key
    // (e.g. a stale client sending a since-removed key).
    const fields = sanitizeMeetingExportFields(body.fields ?? []);

    const existing = await prisma.meetingExportSettings.findFirst();
    const saved = existing
      ? await prisma.meetingExportSettings.update({ where: { id: existing.id }, data: { fields } })
      : await prisma.meetingExportSettings.create({ data: { fields } });

    return NextResponse.json({ fields: saved.fields });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

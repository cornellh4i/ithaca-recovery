import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { ALL_MEETING_EXPORT_FIELD_KEYS, sanitizeMeetingExportFields } from "../../../../util/meetings/meetingExportFields";
import { prisma } from "../../../../lib/prisma";

export const GET = async () => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const [settings, total] = await Promise.all([
      prisma.meetingExportSettings.findFirst(),
      prisma.meeting.count({ where: { deletedAt: null } }),
    ]);

    // No saved row yet -- default to every field selected, matching the export's prior
    // unconditional "full backup" behavior until a Super Admin narrows it down.
    const fields = settings ? sanitizeMeetingExportFields(settings.fields) : ALL_MEETING_EXPORT_FIELD_KEYS;

    return NextResponse.json({ fields, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

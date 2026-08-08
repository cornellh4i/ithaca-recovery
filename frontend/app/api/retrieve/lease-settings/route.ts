import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { defaultLeaseSettings } from "../../../../util/leaseDefaults";
import { computeLeaseYearCycles } from "../../../../util/leaseYearCycles";
import type { IRoomRate } from "../../../../types/models";
import { prisma } from "../../../../lib/prisma";

export const GET = async () => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const [settingsRow, meetingDateRange] = await Promise.all([
      prisma.leaseSettings.findFirst(),
      prisma.meeting.aggregate({
        where: { deletedAt: null },
        _min: { startDateTime: true },
        _max: { startDateTime: true },
      }),
    ]);

    const meetingDates = [meetingDateRange._min.startDateTime, meetingDateRange._max.startDateTime]
      .filter((date): date is Date => date !== null);
    const cycles = computeLeaseYearCycles(meetingDates, new Date());

    const settings = settingsRow
      ? { ...settingsRow, rooms: settingsRow.rooms as unknown as IRoomRate[] }
      : defaultLeaseSettings();

    return NextResponse.json({ settings, cycles });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

import { NextResponse } from "next/server";
import { PrismaClient, Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { defaultLeaseSettings } from "../../../../util/leaseDefaults";
import type { IRoomRate } from "../../../../util/models";

const prisma = new PrismaClient();

export const GET = async () => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const settings = await prisma.leaseSettings.findFirst();
    if (!settings) {
      return NextResponse.json(defaultLeaseSettings());
    }

    return NextResponse.json({
      ...settings,
      rooms: settings.rooms as unknown as IRoomRate[],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

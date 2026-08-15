import { IAdmin } from "../../../../types/models";
import { Role } from '@prisma/client';
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";

const retrieveAdmins = async () => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const admins: IAdmin[] = await prisma.admin.findMany({
      select: {
        name: true,
        email: true,
        role: true,
        googleId: true,
      },
    });

    return NextResponse.json(admins);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export { retrieveAdmins as GET }

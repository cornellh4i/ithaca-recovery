import { IAdmin } from "../../../../types/models";
import { Role } from '@prisma/client';
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";

const getAdminByEmail = async (request: NextRequest) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const email = request.nextUrl.searchParams.get("email")
    const user: (IAdmin | null) = await prisma.admin.findUnique({
      where: {
        email: email as string
      },
      select: {
        name: true,
        email: true,
        role: true,
        googleId: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  }
  catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export { getAdminByEmail as GET }
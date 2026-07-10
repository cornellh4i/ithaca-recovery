import { PrismaClient, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";

const prisma = new PrismaClient();

export const DELETE = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const { email } = await request.json();

    const target = await prisma.admin.findUnique({ where: { email } });
    if (!target) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    if (target.role === Role.SUPER_ADMIN) {
      const superAdminCount = await prisma.admin.count({ where: { role: Role.SUPER_ADMIN } });
      if (superAdminCount <= 1) {
        return NextResponse.json({ error: "Cannot remove the last remaining Super Admin" }, { status: 400 });
      }
    }

    const deleteUser = await prisma.admin.delete({
      where: {
        email: email,
      },
    });
    return NextResponse.json(deleteUser);
  }
  catch (error) {
    console.error("Admin not found: ", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
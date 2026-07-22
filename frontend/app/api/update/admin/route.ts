import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";

// Promote/demote an admin's role. Blocks demoting the last remaining Super
// Admin (including self-demotion) so Super Admins can't lock everyone out.
export const PUT = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const { email, role } = await request.json() as { email: string; role: Role };

    if (role !== Role.SUPER_ADMIN && role !== Role.ADMIN && role !== Role.USER) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const target = await prisma.admin.findUnique({ where: { email } });
    if (!target) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    if (target.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
      const superAdminCount = await prisma.admin.count({ where: { role: Role.SUPER_ADMIN } });
      if (superAdminCount <= 1) {
        return NextResponse.json({ error: "Cannot demote the last remaining Super Admin" }, { status: 400 });
      }
    }

    const updatedAdmin = await prisma.admin.update({
      where: { email },
      data: { role },
    });

    return NextResponse.json(updatedAdmin);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

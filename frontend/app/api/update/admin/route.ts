import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";
import { adminRoleUpdateSchema } from "../../../../util/admin/adminValidation";

// Promote/demote an admin's role. Blocks demoting the last remaining Super
// Admin (including self-demotion) so Super Admins can't lock everyone out.
export const PUT = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const parsed = adminRoleUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email or role", issues: parsed.error.issues }, { status: 400 });
    }
    const { email, role } = parsed.data;

    // Serializable, not just read-committed: a plain count-then-update here would let two
    // concurrent demote requests both read "2 Super Admins left", both pass the check, and
    // both commit -- ending at 0. Postgres detects that write skew under Serializable
    // isolation and aborts one side with a retriable P2034 instead.
    const updatedAdmin = await prisma.$transaction(async (tx) => {
      const target = await tx.admin.findUnique({ where: { email } });
      if (!target) {
        throw NextResponse.json({ error: "Admin not found" }, { status: 404 });
      }

      if (target.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
        const superAdminCount = await tx.admin.count({ where: { role: Role.SUPER_ADMIN } });
        if (superAdminCount <= 1) {
          throw NextResponse.json({ error: "Cannot demote the last remaining Super Admin" }, { status: 400 });
        }
      }

      return tx.admin.update({ where: { email }, data: { role }, select: { name: true, email: true, role: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(updatedAdmin);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another change conflicted with this update -- please retry." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

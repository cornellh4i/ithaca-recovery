import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";

export const DELETE = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const { email } = await request.json();

    // Serializable, not just read-committed: a plain count-then-delete here would let a
    // concurrent demote and a concurrent remove both read "2 Super Admins left", both pass
    // the check, and both commit -- ending at 0. Postgres detects that write skew under
    // Serializable isolation and aborts one side with a retriable P2034 instead.
    const deleteUser = await prisma.$transaction(async (tx) => {
      const target = await tx.admin.findUnique({ where: { email } });
      if (!target) {
        throw new Response(JSON.stringify({ error: "Admin not found" }), { status: 404 });
      }

      if (target.role === Role.SUPER_ADMIN) {
        const superAdminCount = await tx.admin.count({ where: { role: Role.SUPER_ADMIN } });
        if (superAdminCount <= 1) {
          throw new Response(JSON.stringify({ error: "Cannot remove the last remaining Super Admin" }), { status: 400 });
        }
      }

      return tx.admin.delete({ where: { email } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(deleteUser);
  }
  catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another change conflicted with this removal -- please retry." }, { status: 409 });
    }
    console.error("Admin not found: ", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
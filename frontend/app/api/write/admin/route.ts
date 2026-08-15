import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";

// Invite an admin by email; name is unknown until they sign in, so it's created
// empty and filled from the Google profile on that person's first login (see
// authConfig.ts's jwt callback).
export const POST = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const { email, role } = await request.json() as { email: string; role?: Role };

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const resolvedRole = role ?? Role.ADMIN;
    if (resolvedRole !== Role.SUPER_ADMIN && resolvedRole !== Role.ADMIN && resolvedRole !== Role.USER) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const createdUser = await prisma.admin.create({
      data: {
        email,
        name: "",
        role: resolvedRole,
      },
      select: { name: true, email: true, role: true },
    });

    return NextResponse.json(createdUser);
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
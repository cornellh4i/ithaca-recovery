import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { prisma } from "../../../../lib/prisma";
import { adminInviteSchema } from "../../../../util/admin/adminValidation";

// Invite an admin by email; name is unknown until they sign in, so it's created
// empty and filled from the Google profile on that person's first login (see
// authConfig.ts's jwt callback).
export const POST = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const parsed = adminInviteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email or role", issues: parsed.error.issues }, { status: 400 });
    }
    const { email, role } = parsed.data;

    const createdUser = await prisma.admin.create({
      data: {
        email,
        name: "",
        role: role ?? Role.ADMIN,
      },
      select: { name: true, email: true, role: true },
    });

    return NextResponse.json(createdUser);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An admin with this email already exists." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

import { IAdmin } from "../../../../util/models";
import { PrismaClient, Role } from '@prisma/client';
import { NextRequest } from "next/server";
import { requireRole } from "../../../../services/auth";

const prisma = new PrismaClient();

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
        tokenExpiresAt: true,
      },
    });
    if (!user) {
      return new Response(JSON.stringify({ error: `Admin not found` }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  catch (error) {
    return new Response(JSON.stringify({ error: `Admin not found: ${error}` }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export { getAdminByEmail as GET }
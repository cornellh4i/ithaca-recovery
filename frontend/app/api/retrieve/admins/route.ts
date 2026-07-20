import { IAdmin } from "../../../../util/models";
import { PrismaClient, Role } from '@prisma/client';
import { requireRole } from "../../../../services/auth";

const prisma = new PrismaClient();

const retrieveAdmins = async (request: Request) => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const admins: IAdmin[] = await prisma.admin.findMany({
      select: {
        name: true,
        email: true,
        role: true,
        googleId: true,
        tokenExpiresAt: true,
      },
    });

    return new Response(JSON.stringify(admins), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: `Error retrieving admins: ${error}` }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export { retrieveAdmins as GET }

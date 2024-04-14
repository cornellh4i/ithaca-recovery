import { IAdmin } from "../../../../util/models";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const GET = async (request: Request) => {
  try {
    const { email } = await request.json()
    const user: (IAdmin | null) = await prisma.admin.findUnique({
      where: {
        email: email
      }
    });
    if (!user) {
      return new Response(JSON.stringify({ error: "Admin not found" }), {
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
    console.error("Error finding admin: ", error);
    return new Response(JSON.stringify({ error: "Error finding admin" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}


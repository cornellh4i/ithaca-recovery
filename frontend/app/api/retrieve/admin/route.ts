import { NextApiRequest } from "next";
import { IAdmin } from "../../../../util/models";
import { PrismaClient } from '@prisma/client';
import { NextRequest } from "next/server";

const prisma = new PrismaClient();

export const GET = async (request: NextRequest) => {
  try {
    const email = request.nextUrl.searchParams.get("email")
    const user: (IAdmin | null) = await prisma.admin.findUnique({
      where: {
        email: email as string
      }
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


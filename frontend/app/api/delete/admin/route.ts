import { PrismaClient } from "@prisma/client";
import { IAdmin } from "../../../../util/models";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export const DELETE = async (request: Request) => {
  try {
    const { email } = await request.json();
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
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { IAdmin } from "../../../../util/models";

const prisma = new PrismaClient();

export const POST = async (request: Request) => {
  try {
    const newAdmin = await request.json() as IAdmin;

    const createdUser = await prisma.admin.create({
      data: newAdmin
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
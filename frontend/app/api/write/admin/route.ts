import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export const POST = async (request: Request) => {
  try {
    const { uid, name, email, privilegeMode } = await request.json();

    const createdUser = await prisma.admin.create({
      data: {
        uid: uid,
        name: name,
        email: email,
        privilegeMode: privilegeMode
      },
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
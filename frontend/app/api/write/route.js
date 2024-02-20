import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function POST(request) {
  try {
    const { uid, name } = await request.json();

    const createdUser = await prisma.users.create({
      data: {
        uid: uid,
        name: name,
      },
    });

    return NextResponse.json(createdUser);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

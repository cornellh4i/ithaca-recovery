import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const POST = async (request) => {
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
    return Response.json({ error: "Internal Server Error" }, error);
  }
}

export default POST;
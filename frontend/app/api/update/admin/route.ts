import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const updateAdmin = async (request: Request) => {
  try {
    const { uid, name, email } = await request.json();

    const updatedAdmin = await prisma.admin.update({
      where: {
        uid: uid,
      },
      data: {
        name: name,
        email: email,
      },
    });

    return new Response(JSON.stringify(updatedAdmin), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  }
  catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Admin not found or update failed" }, { status: 500 });
  }

};

export { updateAdmin as PUT };
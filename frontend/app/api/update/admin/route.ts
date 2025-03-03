import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const updateAdmin = async (request: Request) => {
   try {
    const newAdmin = await request.json();
    const updateAdmin = await prisma.admin.update({
      where: {
        uid: newAdmin.uid,
      },
      data: {
        name: newAdmin.name,
        email: newAdmin.email,
      },
    });
    return new Response(JSON.stringify(updateAdmin), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
   }
   catch(error) {
    console.error(error);
    return NextResponse.json({ error: "Admin not found or update failed" }, { status: 500 });
   }

};

export { updateAdmin as PUT };
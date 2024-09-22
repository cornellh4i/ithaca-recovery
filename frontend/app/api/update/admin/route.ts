import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const updateAdmin = async (request: Request) => {
  try {
    const { uid, name, email } = await request.json();
    
    if (!uid) {
      return NextResponse.json({ error: "UID is required" }, { status: 400 });
    }

    const updatedAdmin = await prisma.admin.update({
      where: { uid },
      data: { name, email },
    });

    return NextResponse.json(updatedAdmin, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Admin not found or update failed" }, { status: 500 });
  }
};

export { updateAdmin as PUT };

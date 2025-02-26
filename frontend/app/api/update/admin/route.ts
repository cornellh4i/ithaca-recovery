import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export const PUT = async (request: Request) => {
  try {
   
    const { uid, name, email } = await request.json();
   
    if (!uid || !name || !email) {
      return NextResponse.json({ error: "UID, name, and email are required" }, { status: 400 });
    }

    const updatedAdmin = await prisma.admin.update({
      where: { uid },
      data: { name, email },
    });

    // Return the updated admin
    return NextResponse.json(updatedAdmin);
  } catch (error) {
    console.error("Error updating admin:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

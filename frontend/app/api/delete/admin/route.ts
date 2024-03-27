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
    return NextResponse.json(deleteUser);;
  }
  catch (error) {
    console.error("Admin not found: ", error);
    return Response.json({ error: "Internal Server Error" }, error);
  }
}

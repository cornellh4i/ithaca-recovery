import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { IAdmin } from "../../../../util/models";


const prisma = new PrismaClient();

const updateAdmin = async (request: NextRequest) => {
   try {
    const { uid, name, email } = await request.json();
    const updatedUser = await prisma.admin.update({
        where: {
          uid: uid,
        },
        data: {
          name: name,
          email: email,
        },
      });
      return new Response(JSON.stringify(updatedUser), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
   } catch(error) {
        console.error(error);
        return NextResponse.json({ error: "Admin not found or update failed" }, { status: 500 });
   }

};

export { updateAdmin as PUT };
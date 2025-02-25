import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const updateAdmin = async (request: Request): Promise <Response> => {
   try {
    const { uid, name } = await request.json();

    // add implementation here
    const updatedUser = await prisma.admin.update({
        where: {uid},
        data: {name},
      });
  
      return new Response(JSON.stringify(updatedUser), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });

   }
   catch(error) {
    console.error(error)
    return NextResponse.json({ error: "Admin not found or update failed" }, { status: 500 });
   }

};

export { updateAdmin as PUT };
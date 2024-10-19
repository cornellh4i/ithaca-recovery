import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const updateAdmin = async (request) => {
   try {
    const { uid, name, email } = await request.json();
    // add implementation here
    const updatedAdmin = await prisma.admin.update({
        where: {
          uid: uid, // Find the admin by their UID
        },
        data: {
          name: name, // Update the name
          email: email, // Update the email
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
    return NextResponse.json({error: "Update failed or admin not found"}, {status: 500});

   }

};

export { updateAdmin as PUT };
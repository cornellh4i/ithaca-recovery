import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const updateAdmin = async (request: Request): Promise<Response> => {
    try {
      const { uid, name, email } = await request.json();
    
      const updatedAdmin = await prisma.admin.update({
        where: { uid },
        data: {
          name,
          email
        },
      });
      
      return NextResponse.json(updatedAdmin);
  
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Meeting not found or update failed" }, { status: 500 });
    }
  };
  
export { updateAdmin as PUT };
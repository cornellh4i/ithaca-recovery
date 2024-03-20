import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
const prisma = new PrismaClient();
const POST = async (request) => {
   try {
    const { uid, name } = await request.json();
    const updatedUser = await prisma.user.update({
    where: {
        uid: "fillervalue"
    },
    data: {
        name: "fillervalue"
    }
    
    })
    return NextResponse.json(updatedUser)
   }
   
   catch(error) {
   }
};
export default POST
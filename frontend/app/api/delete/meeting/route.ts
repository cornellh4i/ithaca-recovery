import { IMeeting } from "../../../../util/models";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const deleteMeeting = async (request: Request) => {
  try {
    const { mid } = await request.json()
    
    await prisma.meeting.delete({
      where: {
        mid: mid,
      }
    })
    return new Response(JSON.stringify({ message: "Resource deleted successfully" }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error deleting meetings: ", error);
    return new Response(JSON.stringify({ error: "Error deleting meetings" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export { deleteMeeting as DELETE }
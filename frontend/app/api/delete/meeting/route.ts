import { IMeeting } from "../../../../util/models";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const deleteMeeting = async (request: Request) => {
  try {
    const { mid } = await request.json();
    
    // First, check if the meeting is recurring
    const meeting = await prisma.meeting.findUnique({
      where: { mid },
      include: { recurrencePattern: true }
    });

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Use a transaction to ensure both deletions happen or none
    await prisma.$transaction(async (tx) => {
      // If meeting has a recurrence pattern, delete it first
      if (meeting.recurrencePattern) {
        await tx.recurrencePattern.delete({
          where: { meetingId: meeting.id }
        });
      }
      
      // Then delete the meeting
      await tx.meeting.delete({
        where: { mid }
      });
    });

    return new Response(JSON.stringify({ message: "Meeting deleted successfully" }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error deleting meeting: ", error);
    return new Response(JSON.stringify({ error: "Failed to delete meeting" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export { deleteMeeting as DELETE }
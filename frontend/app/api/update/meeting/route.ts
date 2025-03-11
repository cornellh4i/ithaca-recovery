import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { IMeeting } from "../../../../util/models";

const prisma = new PrismaClient();

const updateMeeting = async (request: Request): Promise<Response> => {
  try {
    const newMeeting = await request.json() as IMeeting;
    console.log('Received meeting data:', newMeeting);

    // First check if meeting exists
    const existingMeeting = await prisma.meeting.findUnique({
      where: {
        mid: newMeeting.mid,
      },
    });

    if (!existingMeeting) {
      console.error('Meeting not found:', newMeeting.mid);
      return NextResponse.json({ error: `Meeting with ID ${newMeeting.mid} not found` }, { status: 404 });
    }

    // Convert date strings to Date objects for Prisma
    const updatedMeeting = await prisma.meeting.update({
      where: {
        mid: newMeeting.mid,
      },
      data: {
        title: newMeeting.title,
        description: newMeeting.description,
        creator: newMeeting.creator,
        group: newMeeting.group,
        startDateTime: new Date(newMeeting.startDateTime),
        endDateTime: new Date(newMeeting.endDateTime),
        zoomAccount: newMeeting.zoomAccount,
        zoomLink: newMeeting.zoomLink,
        zid: newMeeting.zid,
        type: newMeeting.type,
        room: newMeeting.room,
      },
    });

    console.log('Updated meeting:', updatedMeeting);
    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error occurred",
      details: error
    }, { status: 500 });
  }
};

export { updateMeeting as PUT };
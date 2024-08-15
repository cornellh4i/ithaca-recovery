import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { IMeeting } from "../../../../util/models";

const prisma = new PrismaClient();

const updateMeeting = async (request: Request): Promise<Response> => {
  try {
    const newMeeting = await request.json() as IMeeting;
    const updatedMeeting = await prisma.meeting.update({
      where: {
        mid: newMeeting.mid,
      },
      data: {
        ...newMeeting
      },
    });

    return new Response(JSON.stringify(updatedMeeting), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Meeting not found or update failed" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
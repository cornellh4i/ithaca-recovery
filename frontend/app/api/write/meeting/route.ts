import { IMeeting } from '../../../../util/models';
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const createMeeting = async (request: Request) => {
  try {
    const { mid, title, description, creator, group, startDateTime, endDateTime, zoomAccount, zoomLink, zid, type, room } = await request.json();

    const newMeeting = await prisma.meeting.create({
      data: {
        mid: mid,
        title: title,
        description: description,
        creator: creator,
        group: group,
        startDateTime: new Date(startDateTime),
        endDateTime: new Date(endDateTime),
        zoomAccount: zoomAccount,
        zoomLink: zoomLink,
        zid: zid,
        type: type,
        room: room
      },
    });

    return new Response(JSON.stringify(newMeeting), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { createMeeting as POST };
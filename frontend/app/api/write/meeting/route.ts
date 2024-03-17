import { IMeeting } from '../../../../util/models';
import { PrismaClient} from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const createMeeting = async (request : string) => {
  try {
    const { mid, title, description, creator, group, date, startTime, fromTime, zoomAccount } = await request.json();

    const newMeeting = await prisma.meeting.create({
      data: {
        mid: mid,
        title: title,
        description: description,
        creator: creator,
        group: group,
        date: new Date(date),
        startTime: new Date(startTime),
        fromTime: new Date(fromTime),
        zoomAccount: zoomAccount,
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
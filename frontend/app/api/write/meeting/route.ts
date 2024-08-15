import { IMeeting } from '../../../../util/models';
import { PrismaClient} from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

const createMeeting = async (request : Request) => {
  try {
    const meeting = await request.json() as IMeeting;
    const newMeeting = await prisma.meeting.create({
      data: meeting
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
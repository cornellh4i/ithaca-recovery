import axios from 'axios'
import { NextResponse } from "next/server"
import { NextApiRequest, NextApiResponse } from 'next/types'
import { GET } from '../generateToken'
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// function for GET request for a meeting
const getZoomMeeting = async (meetingId : string, accessToken : any) => {
  try {

    const req = await axios.get(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/meetings/${meetingId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const response = req.data;
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(`Error getting Zoom meeting: ${meetingId}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { getZoomMeeting as GET };
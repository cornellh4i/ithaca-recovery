import axios from 'axios'
import { NextResponse } from "next/server"
import { NextApiRequest, NextApiResponse } from 'next/types'
import { POST as getZoomToken } from '../generateToken'
import { PrismaClient } from "@prisma/client"
import getZoomMeeting from '../GetMeeting/asyncFunction'

const prisma = new PrismaClient()

const updateZoomMeeting = async (req: Request, res: NextApiResponse) => {
  try {
    const token = (await getZoomToken(req, res));
    const tokenJSON = await token.json();
    const accessToken = tokenJSON.access_token;
    const reqBody = await req.json();
    const { meetingId, ...rest } = reqBody;

    const request = await axios.patch(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/meetings/${meetingId}`,
      rest,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    )

    const response = request.data;

    const meetingResponse = await getZoomMeeting(meetingId, accessToken);
    const meetingDetails = await meetingResponse.json()
    return NextResponse.json(meetingDetails, { status: 200 });
  } catch (error) {
    console.error(`Error updating Zoom meeting: for ${process.env.NEXT_PUBLIC_ZOOM1_EMAIL}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { updateZoomMeeting as PATCH };
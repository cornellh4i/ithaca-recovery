import axios from 'axios'
import { NextResponse } from "next/server"
import { NextApiRequest, NextApiResponse } from 'next/types'
import { POST as getZoomToken } from '../generateToken'
import getZoomMeeting from '../GetMeeting/asyncFunction'

// function for POST request to create a zoom meeting
const createZoomMeeting = async (req: Request, res: NextApiResponse) => {
  try {
    const token = await getZoomToken(req.clone(), res);
    const tokenJSON = await token.json();
    const accessToken = tokenJSON.access_token;
    const reqBody = await req.json();


    const request = await axios.post(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/users/me/meetings`,
      reqBody,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    )

    // call get function on the response we got
    const response = request.data;
    const { id: meetingId } = response;
    return await getZoomMeeting(meetingId, accessToken);
  } catch (error) {
    console.error(`Error creating Zoom meeting: for ${process.env.NEXT_PUBLIC_ZOOM1_EMAIL}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { createZoomMeeting as POST };
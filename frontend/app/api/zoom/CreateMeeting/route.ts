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

// function for POST request to create a zoom meeting
const createZoomMeeting = async (req : NextApiRequest, res : NextApiResponse) => {
  try {
    
    const token = (await GET(req,res));
    const tokenJSON = await token.json();
    const accessToken = tokenJSON.access_token;
    const reqBody = req.body;

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
    const {id : meetingId} = response;
    const meetingDetails = await getZoomMeeting(meetingId, accessToken);

    return NextResponse.json(meetingDetails, { status: 200 });
  } catch (error) {
    console.error(`Error creating Zoom meeting: for ${process.env.NEXT_PUBLIC_ZOOM1_EMAIL}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { createZoomMeeting as POST };
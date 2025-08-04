import axios from 'axios'
import { NextResponse } from "next/server"
import { NextApiRequest, NextApiResponse } from 'next/types'
import { GET as getZoomToken } from '../generateToken'


const rooms = [
  "Test",
  "Serenity Room",
  "Seeds of Hope",
  "Unity Room",
  "Room for Improvement",
  "Small but Powerful - Right",
  "Small but Powerful - Left"
]

const getRoomEmail = (roomName: string): string => {
  const roomIndex = rooms.indexOf(roomName);
  
  if (roomIndex === -1) {
    throw new Error(`Room "${roomName}" not found`);
  }

  switch (roomIndex) {
    case 0: return process.env.ZOOM_TEST_USER_ID!;
    case 1: return process.env.ZOOM_SERENITY_USER_ID!;
    case 2: return process.env.ZOOM_SEEDS_OF_HOPE_USER_ID!;
    case 3: return process.env.ZOOM_UNITY_ROOM_USER_ID!;
    case 4: return process.env.ZOOM_ROOM_FOR_IMPROVEMENT_USER_ID!;
    case 5: return process.env.ZOOM_SMALL_BUT_POWERFUL_RIGHT_USER_ID!;
    case 6: return process.env.ZOOM_SMALL_BUT_POWERFUL_LEFT_USER_ID!;
    default: throw new Error(`Room "${roomName}" has no associated Zoom email.`);
  }
}

const createZoomMeeting = async (req: Request, res: NextApiResponse) => {
  let room_name : string | undefined;
  try {
    const reqBody = await req.json();
    const { room_name, ...zoomMeetingData } = reqBody;
    const userId = getRoomEmail(room_name);
    const token = await getZoomToken(req, res);
    const tokenJSON = await token.json();
    const accessToken = tokenJSON.access_token;

    const request = await axios.post(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/users/${userId}/meetings`,
      zoomMeetingData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    )

    // call get function on the response we got
    const response = request.data;

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(`Error creating Zoom meeting: for ${room_name}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { createZoomMeeting as POST };
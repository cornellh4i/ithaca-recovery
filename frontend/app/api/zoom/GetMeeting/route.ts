import axios from 'axios'
import { NextRequest, NextResponse } from "next/server"
import { NextApiResponse } from 'next/types'
import { GET as getZoomToken } from '../generateToken'


// function for GET request for a meeting
export async function GET(req: NextRequest, res: NextApiResponse) {
  const meetingId = req.nextUrl.searchParams.get("id");
  try {
    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required.' }, { status: 400 });
    }

    const token = (await getZoomToken(req, res));
    const tokenJSON = await token.json();
    const accessToken = tokenJSON.access_token;

    const request = await axios.get(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/meetings/${meetingId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const response = request.data;
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(`Error getting Zoom meeting: ${meetingId}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
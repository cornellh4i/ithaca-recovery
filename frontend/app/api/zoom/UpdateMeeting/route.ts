import axios from 'axios'
import { NextRequest, NextResponse } from "next/server"
import { NextApiRequest, NextApiResponse } from 'next/types'
import { GET as getZoomToken } from '../generateToken'
import { GET as getZoomMeeting } from '../GetMeeting/route'

// function for PATCH request to update a meeting
const updateZoomMeeting = async (req: Request, res: NextApiResponse) => {
  const reqBody = await req.json();
  const { meetingId, ...rest } = reqBody;
  
  try {
    const token = (await getZoomToken(req, res));
    const tokenJSON = await token.json();
    const accessToken = tokenJSON.access_token;

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

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(`Error updating Zoom meeting: for ${meetingId}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { updateZoomMeeting as PATCH };
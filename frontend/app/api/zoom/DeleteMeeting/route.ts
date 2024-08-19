import axios from 'axios'
import { NextRequest, NextResponse } from "next/server"
import { NextApiRequest, NextApiResponse } from 'next/types'
import { GET as getZoomToken } from '../generateToken'

// function for deleting a zoom meeting
const deleteZoomMeeting = async (request: NextRequest, sentResponse: NextApiResponse) => {
    const zoomMeetingID = request.nextUrl.searchParams.get("id");
    
    try {
        const token = await getZoomToken(request, sentResponse);
        const tokenJSON = await token.json();
        const accessToken = tokenJSON.access_token;

        const req = await axios.delete(
            `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/meetings/${zoomMeetingID}`,
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
        console.error(`Error getting Zoom meeting: ${zoomMeetingID}`, error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export { deleteZoomMeeting as DELETE };
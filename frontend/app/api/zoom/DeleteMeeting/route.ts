import axios from 'axios';
import { NextRequest, NextResponse } from "next/server";
import { NextApiResponse } from 'next/types';
import qs from 'query-string';

// function for deleting a Zoom meeting
const deleteZoomMeeting = async (request: NextRequest, sentResponse: NextApiResponse) => {
    const zoomMeetingID = request.nextUrl.searchParams.get("id");
    // retrieve accountId from query params
    const accountId = request.nextUrl.searchParams.get("accountId"); 

    if (!zoomMeetingID || !accountId) {
        return NextResponse.json({ error: 'Meeting ID and account ID are required' }, { status: 400 });
    }

    try {
        // generate Zoom token based on accountId
        const clientId = process.env[`ZOOM${accountId}_CLIENT_ID`];
        const clientSecret = process.env[`ZOOM${accountId}_CLIENT_SECRET`];
        const account = process.env[`ZOOM${accountId}_ACCOUNT_ID`];

        if (!clientId || !clientSecret || !account) {
            throw new Error(`Environment variables for Zoom account ${accountId} are not set`);
        }

        const tokenResponse = await axios.post(
            'https://zoom.us/oauth/token',
            qs.stringify({ grant_type: 'account_credentials', account_id: account }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        // delete the Zoom meeting with the specified ID
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
        console.error(`Error deleting Zoom meeting: ${zoomMeetingID}`, error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export { deleteZoomMeeting as DELETE };

import axios from 'axios';
import { NextResponse } from "next/server";
import { NextApiRequest, NextApiResponse } from 'next/types';
import getZoomMeeting from '../GetMeeting/asyncFunction';
import qs from 'query-string';

// function for POST request to create a zoom meeting
const createZoomMeeting = async (req: Request, res: NextApiResponse) => {
  try {
    const reqBody = await req.json();
    const { accountId, ...meetingData } = reqBody;

    if (!accountId) {
      return NextResponse.json({ error: 'Zoom account ID is required' }, { status: 400 });
    }

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

    // make the request to create the Zoom meeting
    const request = await axios.post(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/users/me/meetings`,
      meetingData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    // call get function on the response we got
    const response = request.data;
    const { id: meetingId } = response;
    return await getZoomMeeting(meetingId, accessToken);
  } catch (error) {
    console.error(`Error creating Zoom meeting:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { createZoomMeeting as POST };

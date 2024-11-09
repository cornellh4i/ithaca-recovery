import axios from 'axios';
import { NextResponse } from "next/server";
import { NextApiResponse } from 'next/types';
import qs from 'query-string';
import { PrismaClient } from "@prisma/client";
import getZoomMeeting from '../GetMeeting/asyncFunction';

const prisma = new PrismaClient();

// function for PATCH request to update a meeting
const updateZoomMeeting = async (req: Request, res: NextApiResponse) => {
  let accountId; 
  try {
    const reqBody = await req.json();
    const { accountId, meetingId, ...rest } = reqBody;

    if (!accountId || !meetingId) {
      return NextResponse.json({ error: 'Account ID and Meeting ID are required' }, { status: 400 });
    }

    // generate zoom token based on accountId
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

    const request = await axios.patch(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/meetings/${meetingId}`,
      rest,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const response = request.data;

    const meetingResponse = await getZoomMeeting(meetingId, accessToken);
    const meetingDetails = await meetingResponse.json();

    return NextResponse.json(meetingDetails, { status: 200 });
  } catch (error) {
    console.error(`Error updating Zoom meeting for account ID ${accountId || 'unknown'}`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { updateZoomMeeting as PATCH };

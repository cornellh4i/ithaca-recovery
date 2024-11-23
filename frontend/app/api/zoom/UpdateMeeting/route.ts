import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import getZoomToken from '../generateToken';
import getZoomMeeting from '../GetMeeting/asyncFunction';

export async function PATCH(req: NextRequest) {
  try {
    // Parse request body
    const reqBody = await req.json();
    const { meetingId, zoomAccount, ...rest } = reqBody;

    // Validate required parameters
    if (!meetingId) {
      return NextResponse.json({ error: 'Missing meeting ID' }, { status: 400 });
    }
    if (!zoomAccount) {
      return NextResponse.json({ error: 'Missing zoomAccount parameter' }, { status: 400 });
    }

    // Generate Zoom token
    const accessToken = await getZoomToken(zoomAccount);

    // Update Zoom meeting
    const zoomResponse = await axios.patch(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/meetings/${meetingId}`,
      rest,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const updatedMeeting = zoomResponse.data;

    // Optionally fetch updated meeting details
    const meetingDetails = await getZoomMeeting(meetingId, accessToken);

    // Return updated meeting details
    return NextResponse.json({ updatedMeeting, meetingDetails }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating Zoom meeting:', error.response?.data || error.message);
    return NextResponse.json(
      { error: 'Internal server error', details: error.response?.data || error.message },
      { status: 500 }
    );
  }
}

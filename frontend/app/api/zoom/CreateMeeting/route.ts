import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import generateZoomToken from '../generateToken'; // Adjust this import path based on your file structure

export async function POST(req: NextRequest) {
  try {
    // Parse the JSON body from the request
    const body = await req.json();
    const { zoomAccount, ...meetingDetails } = body;

    // Validate that the `zoomAccount` parameter is provided
    if (!zoomAccount) {
      return NextResponse.json({ error: 'Missing zoomAccount parameter' }, { status: 400 });
    }

    // Generate the Zoom access token for the specified account
    const accessToken = await generateZoomToken(zoomAccount);

    // Make a POST request to the Zoom API to create a meeting
    const zoomResponse = await axios.post(
      `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/users/me/meetings`,
      meetingDetails,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Return the Zoom meeting details as the response
    return NextResponse.json(zoomResponse.data, { status: 200 });
  } catch (error: any) {
    console.error('Error creating Zoom meeting:', error.response?.data || error.message);

    // Return a 500 error response with details
    return NextResponse.json(
      { error: 'Internal server error', details: error.response?.data || error.message },
      { status: 500 }
    );
  }
}

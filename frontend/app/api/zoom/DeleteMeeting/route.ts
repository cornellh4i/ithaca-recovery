import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import generateZoomToken from '../generateToken'; // Adjust the path as needed

export async function DELETE(request: NextRequest) {
    try {
      // Extract query parameters from the URL
      const zoomMeetingID = request.nextUrl.searchParams.get('id');
      const zoomAccount = request.nextUrl.searchParams.get('zoomAccount');
  
      // Validate required parameters
      if (!zoomMeetingID) {
        return NextResponse.json({ error: 'Missing meeting ID' }, { status: 400 });
      }
      if (!zoomAccount) {
        return NextResponse.json({ error: 'Missing zoomAccount parameter' }, { status: 400 });
      }
  
      // Generate the Zoom access token for the specified account
      const accessToken = await generateZoomToken(zoomAccount);
  
      // Make a DELETE request to the Zoom API
      const zoomResponse = await axios.delete(
        `${process.env.NEXT_PUBLIC_ZOOM_BASE_API}/meetings/${zoomMeetingID}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
  
      // Return the success response
      return NextResponse.json({ message: 'Zoom meeting deleted successfully', data: zoomResponse.data }, { status: 200 });
    } catch (error: any) {
      console.error('Error deleting Zoom meeting:', error.response?.data || error.message);
  
      // Return a 500 error response with details
      return NextResponse.json(
        { error: 'Internal server error', details: error.response?.data || error.message },
        { status: 500 }
      );
    }
  }
  
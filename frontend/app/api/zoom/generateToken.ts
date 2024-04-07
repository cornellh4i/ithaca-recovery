import axios from 'axios';
import { NextResponse } from "next/server";

// function to generate zoom access token 
async function generateZoomToken() {
  try {
    const clientId = process.env.ZOOM1_CLIENT_ID;
    const clientSecret = process.env.ZOOM1_CLIENT_SECRET;
    const accountId = process.env.ZOOM1_ACCOUNT_ID;

    // check if the environment variables are set
    if (!clientId || !clientSecret || !accountId) {
      throw new Error('Environment variables not set');
    }

    // make a post req to zoom api 
    const request = await axios.post('https://zoom.us/oauth/token', {
      grant_type: 'account_credentials',
      account_id: accountId,
    }, {
        headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        }
      }
    );

    const response = await request.data;
    const zoomToken = response.access_token;
    return zoomToken;
  } catch (error) {
    console.error('Error generating zoom token:', error); 
  }
}

// function to export access token 
export async function getZoomToken() {
  try {
    const zoomToken = await generateZoomToken();

    if (!zoomToken) {
      return NextResponse.json({ error: 'Error generating Zoom token' }, { status: 500 });
    }

    return NextResponse.json({ access_token: zoomToken }, { status: 200 });
  } catch (error) {
    console.error('Error getting Zoom token:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
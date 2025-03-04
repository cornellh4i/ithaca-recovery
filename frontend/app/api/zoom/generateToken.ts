import axios from 'axios';
import { NextResponse } from "next/server";
import { NextApiRequest, NextApiResponse } from 'next/types';
import qs from 'query-string';

interface zoomClient {
  zoomAccId: number;
};

// function to generate zoom access token 
const generateZoomToken = async ({zoomAccId}: zoomClient) => {
  try {

    // throw error if the zoomAccId isn't 1,2,3 or 4
    if (![1, 2, 3, 4].includes(zoomAccId)) {
      throw new Error('Invalid zoomAccId. Must be 1, 2, 3, or 4.');
    }
    
    const clientId = process.env[`ZOOM${zoomAccId}_CLIENT_ID`];
    const clientSecret = process.env[`ZOOM${zoomAccId}_CLIENT_SECRET`];
    const accountId = process.env[`ZOOM${zoomAccId}_ACCOUNT_ID`];
  
    // check if the environment variables are set
    if (!clientId || !clientSecret || !accountId) {
      throw new Error('Environment variables not set');
    }

    // make a post req to zoom api 
    const request = await axios.post(
      'https://zoom.us/oauth/token', 
      qs.stringify({ grant_type: 'account_credentials', account_id: accountId }), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        }
      }
    );

    const response = request.data;
    const zoomToken = response.access_token;
    return zoomToken;
  } catch (error) {
    console.error('Error generating zoom token:', error); 
    throw error
  }
}

// function to export access token 
const getZoomToken = async (req: Request, res: NextApiResponse) => {
  // if (req.method === 'GET') {
    try {
      const {zoomAccId} = await req.json();
      if(!zoomAccId) {
        return NextResponse.json({ error: 'Error generating Zoom token' }, { status: 500 }); 
      }
      const zoomToken = await generateZoomToken({zoomAccId});

      if (!zoomToken) {
        return NextResponse.json({ error: 'Error generating Zoom token' }, { status: 500 });
      }

      return NextResponse.json({ access_token: zoomToken }, { status: 200 });
    } catch (error) {
      console.error('Error getting Zoom token:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  // } else {
  //   return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  // }
}

export { getZoomToken as POST };
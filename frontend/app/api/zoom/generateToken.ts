import axios from 'axios';
import { NextResponse } from "next/server";
import { NextApiRequest, NextApiResponse } from 'next/types';
import { PrismaClient} from "@prisma/client";
import qs from 'query-string';

const prisma = new PrismaClient();

// function to generate zoom access token 
const generateZoomToken = async () => {
  try {
    const clientId = process.env.NEXT_PUBLIC_ZOOM1_CLIENT_ID;
    const clientSecret = process.env.NEXT_PUBLIC_ZOOM1_CLIENT_SECRET;
    const accountId = process.env.NEXT_PUBLIC_ZOOM1_ACCOUNT_ID;
  
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

    const response = await request.data;
    const zoomToken = response.access_token;
    return zoomToken;
  } catch (error) {
    console.error('Error generating zoom token:', error); 
  }
}

// function to export access token 
const getZoomToken = async (req: Request, res: NextApiResponse) => {
  // if (req.method === 'GET') {
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
  // } else {
  //   return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  // }
}

export { getZoomToken as GET };
import { NextApiRequest, NextApiResponse } from 'next';
import { authProvider } from "../../../../services/auth";
import getAccessToken from '../AccessToken';
import { AccountInfo, ConfidentialClientApplication } from '@azure/msal-node';
import { NextResponse } from 'next/server';
import axios from 'axios';

const getGroups = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      console.log("Unable to retrieve access token, please try again.");
      return;
    }

    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/v1.0/groups`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(endpoint, { headers });

    const groupData = response.data;

    return NextResponse.json(groupData, { status: 200 });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { getGroups as GET }

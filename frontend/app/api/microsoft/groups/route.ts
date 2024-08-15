import { NextApiRequest, NextApiResponse } from 'next';
import { authProvider } from "../../../../services/auth";
import getAccessToken from '../AccessToken';

const getGroups = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      console.log("Unable to retrieve access token, please try again.")
      return;
    }

    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/groups`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: headers
    });
    if (!response.ok) {
      throw new Error('Error');
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Error' });
  }
}

export { getGroups as GET }
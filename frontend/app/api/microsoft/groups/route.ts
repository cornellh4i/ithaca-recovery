export const dynamic = 'force-dynamic';
import { authProvider } from "../../../../services/auth";
import getAccessToken from '../AccessToken';

const getGroups = async (req: Request) => {
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
      throw new Error('Error fetching groups');
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching groups:', error);
    return new Response(
      JSON.stringify({ error: 'Error fetching groups' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export { getGroups as GET }
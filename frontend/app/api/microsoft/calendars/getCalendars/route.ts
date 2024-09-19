export const dynamic = 'force-dynamic';
import { authProvider } from "../../../../../services/auth";
import getAccessToken from "../../AccessToken";

const getCalendars = async (req: Request) => {
  try {
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      console.log("Unable to retrieve access token, please try again.");
      return new Response(
        JSON.stringify({ error: "Unable to retrieve access token" }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { groupId } = await req.json();
    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/groups/${groupId}/calendar`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error('Error fetching calendar');
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching calendar:', error);
    return new Response(
      JSON.stringify({ error: 'Error fetching calendar' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export { getCalendars as GET }
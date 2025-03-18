export const dynamic = 'force-dynamic';
import { authProvider } from "../../../../services/auth";
import getAccessToken from "../AccessToken";

const getEvents = async (groupId: string) => {
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

    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/v1.0/groups/${groupId}/calendar/events?$orderby=start/dateTime`;
    console.log("Events endpoint:", endpoint);
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Error fetching Microsoft meetings: ${response.status}`);
    }

    const data = await response.json();
    return data;
  }
  catch (error) {
    console.error('Error fetching meetings:', error);
    return new Response(
      JSON.stringify({ error: 'Error fetching meetings' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export { getEvents }
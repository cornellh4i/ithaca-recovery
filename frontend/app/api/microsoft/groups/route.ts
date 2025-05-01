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

const fetchGroups = async () => {
  try {
    console.log("Environment variables check:");
    console.log("- NEXT_PUBLIC_GRAPH_API_ENDPOINT:", process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT ? "✓ Set" : "✗ Not set");
    
    if (!process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT) {
      console.error("fetchGroups: NEXT_PUBLIC_GRAPH_API_ENDPOINT is not set");
      return null;
    }
    
    console.log("fetchGroups: Starting function");
    const accessToken = await getAccessToken();
    console.log("fetchGroups: Access token obtained:", accessToken ? "Yes (token hidden)" : "No token");
    
    if (accessToken === null) {
      console.log("fetchGroups: Unable to retrieve access token, please try again.")
      return null;
    }

    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/v1.0/groups`;
    console.log("fetchGroups: Using endpoint:", endpoint);
    
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    
    console.log("fetchGroups: About to make fetch request");
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: headers
      });
      console.log("fetchGroups: Fetch response received, status:", response.status);

      if (!response.ok) {
        console.error("fetchGroups: Error response:", response.status, response.statusText);
        try {
          const errorText = await response.text();
          console.error("fetchGroups: Error details:", errorText);
          throw new Error(`Error fetching groups: ${response.status} - ${errorText}`);
        } catch (textError) {
          console.error("fetchGroups: Failed to read error response text:", textError);
          throw new Error(`Error fetching groups: ${response.status}`);
        }
      }

      console.log("fetchGroups: Parsing response JSON");
      const data = await response.json();
      console.log("fetchGroups: Data parsed successfully, groups count:", data?.value?.length || 0);
      
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (fetchError) {
      console.error("fetchGroups: Fetch operation failed:", fetchError);
      throw fetchError; 
    }
  } catch (error) {
    console.error("fetchGroups: Caught error:", error);
    console.error("fetchGroups: Error stack:", error instanceof Error ? error.stack : "No stack trace");
    return null;
  }
}

export { fetchGroups, getGroups as GET }
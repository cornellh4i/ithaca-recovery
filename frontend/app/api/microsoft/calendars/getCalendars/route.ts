export const dynamic = 'force-dynamic';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { authProvider } from "../../../../../services/auth";

// Configure MSAL
const cca = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.CLIENT_ID!,
    authority: `${process.env.CLOUD_INSTANCE}${process.env.TENANT_ID}`,
    clientSecret: process.env.CLIENT_SECRET!
  }
});

// Get access token for Microsoft Graph API
const getAccessToken = async (): Promise<string | null> => {
  try {
    console.log("[AccessToken] Getting token with scopes:", ['https://graph.microsoft.com/.default']);
    const result = await cca.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });

    if (!result?.accessToken) {
      console.error("No token returned");
      return null;
    }

    console.log("Token acquired successfully");
    return result.accessToken;
  } catch (err) {
    console.error("Error getting token:", err);
    return null;
  }
};

export async function GET(request: Request) {
  try {
    console.log('Starting getCalendars API call...');

    // Get the access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.error('Failed to get access token');
      return new Response(JSON.stringify({ error: 'Failed to get access token' }), { status: 401 });
    }

    // Get groupId from query parameters
    const url = new URL(request.url);
    const groupId = url.searchParams.get('groupId');

    if (!groupId) {
      console.error('No groupId provided in query parameters');
      return new Response(JSON.stringify({ error: 'groupId is required' }), { status: 400 });
    }

    console.log('Making request to Microsoft Graph API for calendars...');
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/groups/${groupId}/calendar`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Handle error response
    if (!response.ok) {
      console.error("[getCalendars] Error response:", response.status, response.statusText);

      try {
        const errorData = await response.json();
        console.error("[getCalendars] Error data:", errorData);
        return new Response(
          JSON.stringify({
            error: 'Error fetching calendar',
            details: errorData.error ? errorData.error.message : 'Unknown error',
            status: response.status
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: 'Error fetching calendar',
            details: `HTTP error ${response.status}: ${response.statusText}`,
            status: response.status
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Return success response
    const data = await response.json();
    console.log("[getCalendars] Success response:", data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[getCalendars] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Error fetching calendar',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
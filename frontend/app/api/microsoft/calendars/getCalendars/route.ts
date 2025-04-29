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
      console.error("[AccessToken] No token returned");
      return null;
    }

    console.log("[AccessToken] Token acquired successfully");
    return result.accessToken;
  } catch (err) {
    console.error("[AccessToken] Error getting token:", err);
    return null;
  }
};

export async function GET(req: Request) {
  console.log("[getCalendars] GET request received");

  try {
    // Get access token
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      console.error("[getCalendars] Failed to get access token");
      return new Response(
        JSON.stringify({ error: "Unable to retrieve access token" }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get groupId from URL parameters
    const url = new URL(req.url);
    const groupId = url.searchParams.get('groupId');

    if (!groupId) {
      console.error("[getCalendars] Missing groupId parameter");
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: "groupId is required as a query parameter"
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log("[getCalendars] Getting calendars for group:", groupId);

    // Make request to Microsoft Graph API
    const endpoint = `https://graph.microsoft.com/v1.0/groups/${groupId}/calendar`;
    console.log("[getCalendars] Making request to:", endpoint);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

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
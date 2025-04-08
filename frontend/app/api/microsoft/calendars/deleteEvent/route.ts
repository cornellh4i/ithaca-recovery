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

interface EventDeleteBody {
  eventId: string;
  groupId: string;
}

export async function DELETE(req: Request) {
  console.log("[deleteEvent] DELETE request received");

  try {
    // Get access token
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      console.error("[deleteEvent] Failed to get access token");
      return new Response(
        JSON.stringify({ error: "Unable to retrieve access token" }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: EventDeleteBody = await req.json();
    console.log("[deleteEvent] Request body:", body);

    // Validate required fields
    if (!body.eventId || !body.groupId) {
      console.error("[deleteEvent] Missing required fields");
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: "eventId and groupId are required"
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Make request to Microsoft Graph API
    const endpoint = `https://graph.microsoft.com/v1.0/groups/${body.groupId}/calendar/events/${body.eventId}`;
    console.log("[deleteEvent] Making request to:", endpoint);

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Handle error response
    if (!response.ok) {
      console.error("[deleteEvent] Error response:", response.status, response.statusText);

      try {
        // Try to parse error response as JSON
        const errorText = await response.text();
        let errorData;

        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }

        console.error("[deleteEvent] Error data:", errorData);

        return new Response(
          JSON.stringify({
            error: 'Error deleting calendar event',
            details: errorData.error ? errorData.error.message : errorText || 'Unknown error',
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
            error: 'Error deleting calendar event',
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

    // For DELETE operations, the response is typically empty (204 No Content)
    return new Response(null, {
      status: 204,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[deleteEvent] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Error deleting calendar event',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
} 
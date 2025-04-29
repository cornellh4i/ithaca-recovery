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

interface EventRequestBody {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: { email: string }[];
  groupId: string;
}

export async function POST(req: Request) {
  console.log("[createEvent] POST request received");

  try {
    // Get access token
    console.log("fetching token...")
    const accessToken = await getAccessToken();
    console.log("token fetched!")
    if (accessToken === null) {
      console.error("[createEvent] Failed to get access token");
      return new Response(
        JSON.stringify({ error: "Unable to retrieve access token" }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: EventRequestBody = await req.json();
    console.log("[createEvent] Request body:", body);

    // Construct the event object for Microsoft Graph API
    const event = {
      subject: body.title,
      body: {
        contentType: "HTML",
        content: body.description || ""
      },
      start: {
        dateTime: body.startDateTime,
        timeZone: "UTC"
      },
      end: {
        dateTime: body.endDateTime,
        timeZone: "UTC"
      },
      attendees: body.attendees?.map(attendee => ({
        emailAddress: {
          address: attendee.email
        },
        type: "required"
      })) || []
    };

    // Make request to Microsoft Graph API
    const endpoint = `https://graph.microsoft.com/v1.0/groups/${body.groupId}/calendar/events`;
    console.log("[createEvent] Making request to:", endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    // Handle error response
    if (!response.ok) {
      console.error("[createEvent] Error response:", response.status, response.statusText);

      try {
        const errorData = await response.json();
        console.error("[createEvent] Error data:", errorData);
        return new Response(
          JSON.stringify({
            error: 'Error creating calendar event',
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
            error: 'Error creating calendar event.',
            details: `[createEvent1] HTTP error ${response.status}: ${response.url}`,
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
    console.log("[createEvent] Success response:", data);

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[createEvent] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Error creating calendar event',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
} 
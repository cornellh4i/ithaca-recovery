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

interface EventUpdateBody {
  eventId: string;
  groupId: string;
  title?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
  attendees?: { email: string }[];
}

export async function PUT(req: Request) {
  console.log("[updateEvent] PUT request received");

  try {
    // Get access token
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      console.error("[updateEvent] Failed to get access token");
      return new Response(
        JSON.stringify({ error: "Unable to retrieve access token" }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: EventUpdateBody = await req.json();
    console.log("[updateEvent] Request body:", body);

    // Validate required fields
    if (!body.eventId || !body.groupId) {
      console.error("[updateEvent] Missing required fields");
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

    // Construct the update object for Microsoft Graph API
    const updateEvent: any = {};

    if (body.title) {
      updateEvent.subject = body.title;
    }

    if (body.description !== undefined) {
      updateEvent.body = {
        contentType: "HTML",
        content: body.description
      };
    }

    if (body.startDateTime) {
      updateEvent.start = {
        dateTime: body.startDateTime,
        timeZone: "UTC"
      };
    }

    if (body.endDateTime) {
      updateEvent.end = {
        dateTime: body.endDateTime,
        timeZone: "UTC"
      };
    }

    if (body.attendees) {
      updateEvent.attendees = body.attendees.map(attendee => ({
        emailAddress: {
          address: attendee.email
        },
        type: "required"
      }));
    }

    // Make request to Microsoft Graph API
    const endpoint = `https://graph.microsoft.com/v1.0/groups/${body.groupId}/calendar/events/${body.eventId}`;
    console.log("[updateEvent] Making request to:", endpoint);

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateEvent)
    });

    // Handle error response
    if (!response.ok) {
      console.error("[updateEvent] Error response:", response.status, response.statusText);

      try {
        const errorData = await response.json();
        console.error("[updateEvent] Error data:", errorData);
        return new Response(
          JSON.stringify({
            error: 'Error updating calendar event',
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
            error: 'Error updating calendar event',
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

    // Handle the response
    try {
      // Try to parse as JSON if there's content
      const responseText = await response.text();
      let data = {};
      if (responseText) {
        data = JSON.parse(responseText);
      }

      console.log("[updateEvent] Success response:", data);

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // If we can't parse the response, assume it was successful but empty
      console.log("[updateEvent] Empty or non-JSON response, treating as success");
      return new Response(
        JSON.stringify({ message: "Event updated successfully" }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('[updateEvent] Error:', error);

    return new Response(
      JSON.stringify({
        error: 'Error updating calendar event',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
} 
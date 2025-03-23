export const dynamic = 'force-dynamic';
import { authProvider } from "../../../../../services/auth";
import getAccessToken from "../../AccessToken";

interface EventRequestBody {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: { email: string }[];
  groupId: string;
}

export async function POST(req: Request) {
  try {
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      return new Response(
        JSON.stringify({ error: "Unable to retrieve access token" }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const body: EventRequestBody = await req.json();

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
      attendees: body.attendees || []
    };

    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/groups/${body.groupId}/calendar/events`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create calendar event');
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating calendar event:', error);
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
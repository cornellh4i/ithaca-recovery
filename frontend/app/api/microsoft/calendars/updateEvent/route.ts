export const dynamic = 'force-dynamic';
import { authProvider } from "../../../../../services/auth";
import getAccessToken from "../../AccessToken";

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

    const body: EventUpdateBody = await req.json();

    // Construct the update object with only provided fields
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
      updateEvent.attendees = body.attendees;
    }

    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/groups/${body.groupId}/calendar/events/${body.eventId}`;
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateEvent)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update calendar event');
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error updating calendar event:', error);
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
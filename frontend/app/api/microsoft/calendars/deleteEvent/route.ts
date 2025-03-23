export const dynamic = 'force-dynamic';
import { authProvider } from "../../../../../services/auth";
import getAccessToken from "../../AccessToken";

interface EventDeleteBody {
  eventId: string;
  groupId: string;
}

export async function DELETE(req: Request) {
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

    const body: EventDeleteBody = await req.json();
    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/groups/${body.groupId}/calendar/events/${body.eventId}`;

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to delete calendar event');
    }

    return new Response(null, {
      status: 204,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error deleting calendar event:', error);
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
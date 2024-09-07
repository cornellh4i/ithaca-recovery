import { NextApiRequest, NextApiResponse } from 'next';
import { authProvider } from "../../../../../services/auth";
import getAccessToken from "../../AccessToken";
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const getCalendars = async (req: NextRequest, res: NextApiResponse) => {
  try {
    const accessToken = await getAccessToken();
    if (accessToken === null) {
      console.log("Unable to retrieve access token, please try again.")
      return;
    }

    console.log(accessToken);

    // const accessToken = "eyJ0eXAiOiJKV1QiLCJub25jZSI6IlN3cFduNE5NTlZOU2pNaTRidmVXVWg3Z0NSY0hkR2tyeEVBeXlVR1h0Q3MiLCJhbGciOiJSUzI1NiIsIng1dCI6IktRMnRBY3JFN2xCYVZWR0JtYzVGb2JnZEpvNCIsImtpZCI6IktRMnRBY3JFN2xCYVZWR0JtYzVGb2JnZEpvNCJ9.eyJhdWQiOiJodHRwczovL2dyYXBoLm1pY3Jvc29mdC5jb20iLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9iNDg0ODkzYy1hMzcyLTRlYzAtOWQ1Mi0wM2Y2NjkzZmNmMDYvIiwiaWF0IjoxNzI0Mjk5MjExLCJuYmYiOjE3MjQyOTkyMTEsImV4cCI6MTcyNDMwMzExMSwiYWlvIjoiRTJkZ1lPakxZU21PUHh2UzhjdGxCN3ZLK1VjaUFBPT0iLCJhcHBfZGlzcGxheW5hbWUiOiJJdGhhY2EgQ29tbXVuaXR5IFJlY292ZXJ5IiwiYXBwaWQiOiJmODA2ZjkwMS02OTJlLTRhYjMtYWE4NC1mZmFiOTViNTE1ZmIiLCJhcHBpZGFjciI6IjEiLCJpZHAiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9iNDg0ODkzYy1hMzcyLTRlYzAtOWQ1Mi0wM2Y2NjkzZmNmMDYvIiwiaWR0eXAiOiJhcHAiLCJvaWQiOiJiNTBjYzkyYy1mMjQ0LTQ4MWEtOTE3OC0wOGQwOGIyOWIyMTkiLCJyaCI6IjAuQVJVQVBJbUV0SEtqd0U2ZFVnUDJhVF9QQmdNQUFBQUFBQUFBd0FBQUFBQUFBQUNiQUFBLiIsInJvbGVzIjpbIkNhbGVuZGFycy5SZWFkIiwiR3JvdXAuUmVhZC5BbGwiLCJHcm91cC5DcmVhdGUiLCJHcm91cC5SZWFkV3JpdGUuQWxsIiwiQ2FsZW5kYXJzLlJlYWRCYXNpYy5BbGwiLCJDYWxlbmRhcnMuUmVhZFdyaXRlIl0sInN1YiI6ImI1MGNjOTJjLWYyNDQtNDgxYS05MTc4LTA4ZDA4YjI5YjIxOSIsInRlbmFudF9yZWdpb25fc2NvcGUiOiJOQSIsInRpZCI6ImI0ODQ4OTNjLWEzNzItNGVjMC05ZDUyLTAzZjY2OTNmY2YwNiIsInV0aSI6IkRVaGRIOVhqeEVXSHBnMkNheHNWQUEiLCJ2ZXIiOiIxLjAiLCJ3aWRzIjpbIjA5OTdhMWQwLTBkMWQtNGFjYi1iNDA4LWQ1Y2E3MzEyMWU5MCJdLCJ4bXNfaWRyZWwiOiI3IDE4IiwieG1zX3RjZHQiOjE3MTA4NzcwNzJ9.XrC1yIvPG_pB6x8LtUDWJllvG2JhgUwvPOwkBG0t9V3IbdJljX97ChMgB5dYc09zY2s4GJI3-_ebMEX1lk27PTI9fPG-kUbBR6tq7oksBTZen3YGw6wSmvu9XJVfjahUnuKnDx-iAb9NohVafO4nwbC_XFzgAzIMjFvxc3-HcL-ot6OPeYa52YuG5t8qmEzpE0kU7QgChsYSTVsBgKxf9w7Mh8pEXt6Ooo1dgs2lxVeYQ-Zj6tP_0zvSrJ4oaureV1xmQiyOfQOz2rLRsKsR0Nsp5Aqw7oOlTo6ElI4uUSIoPweUJ-pb2r5kVzSqP9C1-C6o2JT_gcx5fLclrg3TaA"

    const groupId = req.nextUrl.searchParams.get("groupId")
    const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/v1.0/groups/${groupId}/calendar`;
    // const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/v1.0/me/calendarGroups`;r
    // const endpoint = `${process.env.NEXT_PUBLIC_GRAPH_API_ENDPOINT}/v1.0/users/e15f61c9-f6aa-4693-80b4-84747de82fce/calendar`;

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    const response = await axios.get(endpoint, { headers });
    
    const calendarData = response.data;
    return NextResponse.json(calendarData, { status: 200 });  
  } 
  catch (error) {
    console.error('Error fetching calendar:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { getCalendars as GET }
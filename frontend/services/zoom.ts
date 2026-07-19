import "server-only";
import { IMeeting } from "../util/models";

const ZOOM_BASE_API = process.env.NEXT_PUBLIC_ZOOM_BASE_API ?? "https://api.zoom.us/v2";

// One Google Calendar per physical Zoom Room — separate from googleCalendar.ts's category calendars.
export const zoomRoomCalendarId: Record<string, string> = {
  "Serenity Room - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_SERENITY_ROOM ?? "",
  "Seeds of Hope Room - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_SEEDS_OF_HOPE_ROOM ?? "",
  "Unity Room - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_UNITY_ROOM ?? "",
  "Room for Improvement - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_ROOM_FOR_IMPROVEMENT ?? "",
  "Children's Room @ 518 - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_CHILDRENS_ROOM_518 ?? "",
};

// One dedicated Zoom user per room (ICR provisioned 5 separate licensed accounts so up to
// 5 rooms can each host a concurrent meeting). Zoom's userId path param accepts an email.
export const zoomRoomHostEmail: Record<string, string> = {
  "Serenity Room - Zoom": process.env.ZOOM_HOST_SERENITY_ROOM ?? "",
  "Seeds of Hope Room - Zoom": process.env.ZOOM_HOST_SEEDS_OF_HOPE_ROOM ?? "",
  "Unity Room - Zoom": process.env.ZOOM_HOST_UNITY_ROOM ?? "",
  "Room for Improvement - Zoom": process.env.ZOOM_HOST_ROOM_FOR_IMPROVEMENT ?? "",
  "Children's Room @ 518 - Zoom": process.env.ZOOM_HOST_CHILDRENS_ROOM_518 ?? "",
};

async function getZoomAccessToken(): Promise<string | null> {
  try {
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    if (!clientId || !clientSecret || !accountId) return null;

    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch (error) {
    console.error("Zoom getAccessToken error:", error);
    return null;
  }
}

export async function checkZoomReachable(): Promise<boolean> {
  return (await getZoomAccessToken()) !== null;
}

// Zoom ignores `timezone` if start_time ends in "Z" — send ET wall-clock time instead.
function toZoomStartTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value?.padStart(2, "0") ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

function buildZoomMeetingBody(meeting: IMeeting) {
  const durationMinutes = Math.round(
    (new Date(meeting.endDateTime).getTime() - new Date(meeting.startDateTime).getTime()) / 60000,
  );
  return {
    topic: meeting.title,
    type: 2, // single stable meeting, reused across all occurrences
    start_time: toZoomStartTime(new Date(meeting.startDateTime)),
    duration: durationMinutes,
    timezone: "America/New_York",
    agenda: meeting.description,
    settings: { host_video: true, participant_video: true, join_before_host: true },
  };
}

export async function createZoomMeeting(meeting: IMeeting, zoomRoom: string): Promise<{ zoomLink: string; zid: string } | null> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return null;

    const hostEmail = zoomRoomHostEmail[zoomRoom];
    if (!hostEmail) return null;

    const res = await fetch(`${ZOOM_BASE_API}/users/${encodeURIComponent(hostEmail)}/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildZoomMeetingBody(meeting)),
    });
    if (!res.ok) {
      console.error("Zoom createMeeting error:", await res.text());
      return null;
    }
    const data = await res.json();
    return { zoomLink: data.join_url, zid: String(data.id) };
  } catch (error) {
    console.error("Zoom createMeeting error:", error);
    return null;
  }
}

export async function updateZoomMeeting(zid: string, meeting: IMeeting): Promise<boolean> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return false;

    const res = await fetch(`${ZOOM_BASE_API}/meetings/${zid}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildZoomMeetingBody(meeting)),
    });
    return res.ok;
  } catch (error) {
    console.error("Zoom updateMeeting error:", error);
    return false;
  }
}

export async function deleteZoomMeeting(zid: string): Promise<boolean> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return false;

    const res = await fetch(`${ZOOM_BASE_API}/meetings/${zid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch (error) {
    console.error("Zoom deleteMeeting error:", error);
    return false;
  }
}

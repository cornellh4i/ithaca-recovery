import "server-only";
import { IMeeting } from "../types/models";
import { findResourceConflicts, OccurrenceInput, OccupiedClaim } from "../util/meetings/resourceOverlap";
import { prisma } from "../lib/prisma";

const ZOOM_BASE_API = process.env.NEXT_PUBLIC_ZOOM_BASE_API ?? "https://api.zoom.us/v2";

// One Google Calendar per physical Zoom Room — separate from googleCalendar.ts's category calendars.
export const zoomRoomCalendarId: Record<string, string> = {
  "Serenity Room - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_SERENITY_ROOM ?? "",
  "Seeds of Hope Room - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_SEEDS_OF_HOPE_ROOM ?? "",
  "Unity Room - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_UNITY_ROOM ?? "",
  "Room for Improvement - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_ROOM_FOR_IMPROVEMENT ?? "",
  "Children's Room @ 518 - Zoom": process.env.GOOGLE_CALENDAR_ZOOM_CHILDRENS_ROOM_518 ?? "",
};

// ICR's licensed Zoom users are a shared pool, not tied to any one room — each can host only
// one meeting at a time, so which host a given meeting gets is resolved per-booking (see
// resolveZoomHost below) rather than fixed by room. One env var, comma-separated, so adding
// or removing a licensed seat doesn't require a code change.
export const zoomHostPool: string[] = (process.env.ZOOM_HOSTS ?? "")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

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

// Per-host pool validity: confirms each ZOOM_HOSTS entry resolves to a real user on the
// account, and flags non-Licensed (Basic, type 1) hosts — a Basic host caps meetings at 40
// minutes, which silently breaks longer meetings assigned to that host.
export async function checkZoomHostPool(): Promise<Record<string, { ok: boolean; licensed: boolean | null }>> {
  const token = await getZoomAccessToken();

  // Built as an array first, in zoomHostPool's own order, then assembled into an object in
  // one pass -- object key order otherwise follows whichever host's fetch happens to resolve
  // first, which varies run to run (Promise.all itself preserves the input array's order in
  // its resolved array regardless of completion order, so this part doesn't race).
  const entries = await Promise.all(zoomHostPool.map(async (email): Promise<[string, { ok: boolean; licensed: boolean | null }]> => {
    if (!token) return [email, { ok: false, licensed: null }];
    try {
      const res = await fetch(`${ZOOM_BASE_API}/users/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [email, { ok: false, licensed: null }];
      const data = await res.json();
      return [email, { ok: true, licensed: data.type === 2 }];
    } catch (error) {
      console.error("Zoom checkHostPool error for a pooled host:", error);
      return [email, { ok: false, licensed: null }];
    }
  }));

  return Object.fromEntries(entries);
}

// Reports every pool host's availability against `candidate`, instead of stopping at the
// first free one (contrast resolveZoomHost below) -- backs the Meeting Form's "Check host
// availability" action, which needs to show a check/cross per host, not just resolve one.
// Pool is small (<=5), so checking all of them in parallel is cheap.
export async function checkZoomHostPoolAvailability(
  candidate: OccurrenceInput,
  opts: { excludeMid?: string } = {},
): Promise<{ host: string; available: boolean }[]> {
  return Promise.all(zoomHostPool.map(async (host) => {
    const conflicts = await findResourceConflicts("zoomHost", host, candidate, prisma, {
      excludeMid: opts.excludeMid,
      includeSuspended: true,
    });
    return { host, available: conflicts.length === 0 };
  }));
}

// Picks the first host in the pool (list order) with zero conflicts against `candidate`'s
// occurrences, per the resource-generic overlap check in util/resourceOverlap.ts. Suspended
// meetings are included in the occupancy check (opts.excludeMid lets an update re-check a
// meeting without conflicting against its own prior occurrences) — a suspended meeting's Zoom
// meeting still exists, it's just not synced. `opts.extraOccupied` lets a caller processing
// several candidates in one batch (the XLSX import route) claim a host in memory before it's
// committed to the DB, so two rows in the same batch can't race for the same host. Returns
// null if every host is busy.
export async function resolveZoomHost(
  candidate: OccurrenceInput,
  opts: { excludeMid?: string; extraOccupied?: OccupiedClaim[] } = {},
): Promise<string | null> {
  for (const host of zoomHostPool) {
    const conflicts = await findResourceConflicts("zoomHost", host, candidate, prisma, {
      excludeMid: opts.excludeMid,
      includeSuspended: true,
      extraOccupied: opts.extraOccupied,
    });
    if (conflicts.length === 0) return host;
  }
  return null;
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

export async function createZoomMeeting(meeting: IMeeting, hostEmail: string): Promise<{ zoomLink: string; zid: string; zoomPasscode: string | null } | null> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return null;
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
    return { zoomLink: data.join_url, zid: String(data.id), zoomPasscode: data.password ?? null };
  } catch (error) {
    console.error("Zoom createMeeting error:", error);
    return null;
  }
}

// Zoom's own boilerplate invitation text (join link, meeting ID, passcode, dial-in numbers)
// that it auto-generates for every meeting -- not returned by the create/update endpoints,
// only by this dedicated one.
export async function getZoomMeetingInvitation(zid: string): Promise<string | null> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return null;

    const res = await fetch(`${ZOOM_BASE_API}/meetings/${zid}/invitation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error("Zoom getMeetingInvitation error:", await res.text());
      return null;
    }
    const data = await res.json();
    return data.invitation ?? null;
  } catch (error) {
    console.error("Zoom getMeetingInvitation error:", error);
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
    if (!res.ok) console.error("Zoom updateMeeting error:", await res.text());
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
    if (!res.ok) console.error("Zoom deleteMeeting error:", await res.text());
    return res.ok;
  } catch (error) {
    console.error("Zoom deleteMeeting error:", error);
    return false;
  }
}

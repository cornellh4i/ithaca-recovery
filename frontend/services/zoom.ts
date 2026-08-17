import "server-only";
import { Prisma } from "@prisma/client";
import { IMeeting } from "../types/models";
import { findResourceConflicts, findFirstFreePoolHost, OccurrenceInput } from "../util/meetings/resourceOverlap";
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

// ICR's licensed Zoom users are a shared pool, not tied to any one room — a licensed host can
// run up to ZOOM_LICENSED_HOST_CAPACITY meetings at once (Zoom's own per-account rule), so
// which host a given meeting gets is resolved per-booking (see resolveZoomHost below) rather
// than fixed by room. One env var, comma-separated, so adding or removing a licensed seat
// doesn't require a code change.
export const zoomHostPool: string[] = (process.env.ZOOM_HOSTS ?? "")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

// Zoom's concurrent-meeting caps are license-dependent: a licensed (Business) user can host 2
// meetings simultaneously; a basic user only 1. Capacity is resolved per host from live license
// status (getZoomHostCapacities below) rather than assumed — a blanket capacity of 2 would
// silently double-book a host that ever downgrades to basic, and the failure would only surface
// when the second Zoom call can't start (#446).
export const ZOOM_LICENSED_HOST_CAPACITY = 2;
const ZOOM_BASIC_HOST_CAPACITY = 1;

// Zoom Server-to-Server OAuth tokens are valid ~1hr; cached module-level (not per-request) so
// a burst of Zoom API calls (e.g. bulk meeting creation, each of which hits this 3+ times)
// fires one token request instead of one per call -- Zoom rate-limits the token endpoint itself.
let cachedZoomToken: { token: string; expiresAt: number } | null = null;
// Safety margin subtracted from Zoom's own `expires_in`, not a hardcoded assumption about
// token lifetime -- covers clock drift and in-flight requests started just before expiry.
const ZOOM_TOKEN_SAFETY_MARGIN_MS = 10 * 60 * 1000;
const ZOOM_TOKEN_FALLBACK_TTL_MS = 50 * 60 * 1000; // used only if expires_in is ever missing

// Shared by every concurrent non-forceRefresh cache miss -- without this, N calls that all see
// a stale/empty cache before the first one's response lands would each fire their own redundant
// request against Zoom's rate-limited token endpoint. Cleared in a `finally` once the request
// settles, so the next genuine cache miss starts a fresh one rather than reusing a stale promise.
let inFlightTokenRequest: Promise<string | null> | null = null;

async function fetchZoomAccessToken(): Promise<string | null> {
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
    const token = data.access_token ?? null;
    if (token) {
      const expiresInMs = typeof data.expires_in === "number" ? data.expires_in * 1000 : ZOOM_TOKEN_FALLBACK_TTL_MS;
      const ttlMs = Math.max(expiresInMs - ZOOM_TOKEN_SAFETY_MARGIN_MS, 0);
      cachedZoomToken = { token, expiresAt: Date.now() + ttlMs };
    }
    return token;
  } catch (error) {
    console.error("Zoom getAccessToken error:", error);
    return null;
  }
}

// `forceRefresh` bypasses both the cache and the in-flight coalescing below, always firing its
// own independent request -- used exclusively by checkZoomReachable (the Diagnostics health
// check), which needs a genuine round trip every call, not a token shared with (or reused from)
// an unrelated concurrent caller. Without forceRefresh, a revoked credential or a real Zoom
// outage would stay masked by a healthy-looking cached token for up to its full TTL, since no
// other caller of this function has a reason to skip the cache.
async function getZoomAccessToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedZoomToken && cachedZoomToken.expiresAt > Date.now()) {
    return cachedZoomToken.token;
  }

  if (forceRefresh) return fetchZoomAccessToken();

  if (!inFlightTokenRequest) {
    inFlightTokenRequest = fetchZoomAccessToken().finally(() => {
      inFlightTokenRequest = null;
    });
  }
  return inFlightTokenRequest;
}

// Called wherever a cached token is used against a non-token-endpoint Zoom API call -- a 401
// there means the cached token was revoked/expired early (credential rotation, app
// deactivated), not that the request itself was malformed. Evicting it here, rather than
// waiting out the cache TTL, lets the next call self-heal with a fresh token instead of every
// Zoom call failing silently for up to the rest of the cache window.
function invalidateZoomTokenIfUnauthorized(res: Response): void {
  if (res.status === 401) cachedZoomToken = null;
}

export async function checkZoomReachable(): Promise<boolean> {
  return (await getZoomAccessToken(true)) !== null;
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
      invalidateZoomTokenIfUnauthorized(res);
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

// Per-host concurrent-meeting capacities, license-resolved with a 12h in-memory TTL cache.
// The TTL is deliberately not the downgrade guard — meetings are booked days ahead, so the real
// guard for already-booked meetings is Diagnostics' pool-health card; the cache just keeps warm
// instances from re-asking Zoom on every write (serverless instance churn refreshes it sooner
// than 12h in practice anyway). Fail-safe: unknown/unreachable license status → capacity 1,
// which degrades to the pre-#446 behavior and can never overbook. An all-unknown result (e.g.
// a transient token outage) is cached only briefly so one blip doesn't pin every host to
// capacity 1 for a full window.
const HOST_CAPACITY_TTL_MS = 12 * 60 * 60 * 1000;
const HOST_CAPACITY_UNKNOWN_TTL_MS = 5 * 60 * 1000;
let cachedHostCapacities: { capacities: Record<string, number>; expiresAt: number } | null = null;
let inFlightCapacityRequest: Promise<Record<string, number>> | null = null;

async function fetchZoomHostCapacities(): Promise<Record<string, number>> {
  const pool = await checkZoomHostPool();
  const capacities = Object.fromEntries(
    zoomHostPool.map((host) => [
      host,
      pool[host]?.licensed === true ? ZOOM_LICENSED_HOST_CAPACITY : ZOOM_BASIC_HOST_CAPACITY,
    ]),
  );
  const allUnknown = zoomHostPool.length > 0 && zoomHostPool.every((host) => pool[host]?.licensed == null);
  const ttl = allUnknown ? HOST_CAPACITY_UNKNOWN_TTL_MS : HOST_CAPACITY_TTL_MS;
  cachedHostCapacities = { capacities, expiresAt: Date.now() + ttl };
  return capacities;
}

// MUST be called BEFORE entering a lockResourceClaims-guarded transaction — a Zoom API round
// trip while pool advisory locks are held would extend lock hold time by an external call's
// latency (see util/resourceLocks.ts's INVARIANT comment).
export async function getZoomHostCapacities(): Promise<Record<string, number>> {
  if (cachedHostCapacities && cachedHostCapacities.expiresAt > Date.now()) {
    return cachedHostCapacities.capacities;
  }
  // Same in-flight coalescing as the token cache above -- concurrent cache misses share one
  // checkZoomHostPool sweep instead of each firing pool-sized bursts of Zoom user lookups.
  if (!inFlightCapacityRequest) {
    inFlightCapacityRequest = fetchZoomHostCapacities().finally(() => {
      inFlightCapacityRequest = null;
    });
  }
  return inFlightCapacityRequest;
}

// Reports every pool host's availability against `candidate`, instead of stopping at the
// first free one (contrast resolveZoomHost below) -- backs the Meeting Form's "Check host
// availability" action, which needs to show a check/cross per host, not just resolve one.
// Pool is small (<=5), so checking all of them in parallel is cheap. Capacity-aware: a
// licensed host with one overlapping meeting still reports available (#446).
export async function checkZoomHostPoolAvailability(
  candidate: OccurrenceInput,
  opts: { excludeMid?: string } = {},
): Promise<{ host: string; available: boolean }[]> {
  const capacities = await getZoomHostCapacities();
  return Promise.all(zoomHostPool.map(async (host) => {
    const conflicts = await findResourceConflicts("zoomHost", host, candidate, prisma, {
      excludeMid: opts.excludeMid,
      includeSuspended: true,
      capacity: capacities[host] ?? 1,
    });
    return { host, available: conflicts.length === 0 };
  }));
}

// Picks the first host in the pool (list order) with spare capacity against `candidate`'s
// occurrences. Suspended meetings are included in the occupancy check (opts.excludeMid lets an
// update re-check a meeting without conflicting against its own prior occurrences) — a
// suspended meeting's Zoom meeting still exists, it's just not synced. `client` must be the same
// `tx` a caller's `lockResourceClaims` call locked the whole `zoomHostPool` on (see
// util/resourceLocks.ts's INVARIANT comment) -- resolving without holding those locks first
// reopens the exact check-then-write race this function exists to close (see #360), and the
// capacity count widens that TOCTOU surface, so it must stay inside the lock too (#446).
// `capacities` comes from getZoomHostCapacities, resolved by the caller BEFORE the transaction
// (see its comment); omitted hosts fail safe to capacity 1. Returns null if every host is at
// capacity (pool exhausted).
export async function resolveZoomHost(
  candidate: OccurrenceInput,
  client: Prisma.TransactionClient,
  opts: { excludeMid?: string; capacities?: Record<string, number> } = {},
): Promise<string | null> {
  return findFirstFreePoolHost(zoomHostPool, candidate, client, {
    excludeMid: opts.excludeMid,
    includeSuspended: true,
    capacities: opts.capacities,
  });
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
    invalidateZoomTokenIfUnauthorized(res);
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
    invalidateZoomTokenIfUnauthorized(res);
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
    invalidateZoomTokenIfUnauthorized(res);
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
    invalidateZoomTokenIfUnauthorized(res);
    if (!res.ok) console.error("Zoom deleteMeeting error:", await res.text());
    return res.ok;
  } catch (error) {
    console.error("Zoom deleteMeeting error:", error);
    return false;
  }
}

import "server-only";
import { Prisma } from "@prisma/client";
import { IMeeting } from "../types/models";
import { expandOccurrences, findResourceConflicts, findFirstFreePoolHost, getPoolHostLoads, OccurrenceInput } from "../util/meetings/resourceOverlap";
import { isSharedZoomScheduleCompatible } from "../util/meetings/sharedZoomSchedule";
import { buildLinkedScheduleLabel, fellowshipPrefixedTitle, isZoomBearing, resolveFamilyRows } from "../util/meetings/linkedSchedules";
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

// Reports every pool host's remaining capacity against `candidate`, instead of stopping at
// the first free one (contrast resolveZoomHost below) -- backs the Meeting Form's per-host
// "1/2"-style free-slot display (#472), which needs a count per host, not just one resolution.
// freeSlots reflects the candidate's WORST occurrence (peak concurrency across all of them) —
// what assignment would actually see — and 0 means the host is at capacity for this schedule.
export async function checkZoomHostPoolAvailability(
  candidate: OccurrenceInput,
  opts: { excludeMid?: string } = {},
): Promise<{ host: string; freeSlots: number; capacity: number }[]> {
  const capacities = await getZoomHostCapacities();
  const loads = await getPoolHostLoads(zoomHostPool, candidate, prisma, {
    excludeMid: opts.excludeMid,
    includeSuspended: true,
  });
  return loads.map(({ host, peak }) => {
    const capacity = capacities[host] ?? 1;
    return { host, capacity, freeSlots: Math.max(0, capacity - peak) };
  });
}

// Picks a host with spare capacity for `candidate`, ordered as tiered least-connections --
// licensed before basic, least-loaded within the tier, pool list order as tie-break (see
// findFirstFreePoolHost, #471). Suspended meetings are included in the occupancy check (opts.excludeMid lets an
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

// Zoom's weekday numbering for recurrence.weekly_days / monthly_week_day (1 = Sunday).
const ZOOM_WEEKDAY: Record<string, number> = {
  Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7,
};

// The family members Zoom's one schedule actually has to cover, besides `meeting` itself. An
// In-Person member is deliberately excluded: it holds no zid, and unioning its weekdays into
// weekly_days would advertise Zoom occurrences for a schedule that never meets online.
function zoomScheduleSiblings(meeting: IMeeting, family: IMeeting[]): IMeeting[] {
  return resolveFamilyRows(meeting, family)
    .filter((row) => row.mid !== meeting.mid && isZoomBearing(row));
}

// Maps the app's recurrence pattern onto Zoom's recurrence object so a recurring series is a
// real type-8 recurring meeting on Zoom (visible as a series in the host's portal). An
// unbounded series sends end_times: 0 -- undocumented but exactly what the Zoom portal itself
// stores for its own "no end" meetings (verified empirically 2026-08-20; Zoom's PATCH path
// clamps it to a ~2-year rolling horizon, which future edits keep pushing forward).
// Some Zoom meetings serve several platform rows at once (one linked-schedule family -- e.g. a
// Hybrid M-Sat row and a Remote Sunday row on one legacy meeting). Zoom holds ONE schedule, so a
// PATCH built from a single row would silently narrow it to that row's days (#513); with the
// family supplied, the recurrence is instead the union of its Zoom-bearing rows' weekdays --
// valid only when all of them are weekly at the same interval, time-of-day, and duration, which
// is how the shared legacy meetings were built. "incompatible" tells the caller to leave Zoom's
// schedule untouched rather than mangle it.
function buildZoomRecurrence(meeting: IMeeting, family: IMeeting[] = []): Record<string, unknown> | null | "incompatible" {
  const siblings = zoomScheduleSiblings(meeting, family);
  if (!meeting.isRecurring || !meeting.recurrencePattern) return siblings.length ? "incompatible" : null;
  if (siblings.length > 0) {
    const rows = [meeting, ...siblings];
    // Same compatibility rule the retrieve route reports to the UI as a divergence -- shared
    // so the two can never disagree about whether Zoom is waiting on a sibling edit.
    if (!isSharedZoomScheduleCompatible(rows)) return "incompatible";
    const unionDays = [...new Set(rows.flatMap((m) => m.recurrencePattern?.daysOfWeek ?? []))]
      .map((d) => ZOOM_WEEKDAY[d]).filter(Boolean).sort((a, b) => a - b);
    // Always unbounded: every shared meeting is an endless adopted legacy series; a union of
    // per-row end dates has no single-series representation worth inventing for them.
    return { type: 2, repeat_interval: meeting.recurrencePattern.interval ?? 1, weekly_days: unionDays.join(","), end_times: 0 };
  }
  const p = meeting.recurrencePattern;
  const end = p.endDate
    ? { end_date_time: new Date(p.endDate).toISOString().replace(/\.\d{3}Z$/, "Z") }
    : p.numberOfOccurrences
      // Zoom rejects counts above 50 -- a longer bounded series still ends on time because the
      // app/calendars own the real schedule; Zoom's copy just under-shows the tail.
      ? { end_times: Math.min(p.numberOfOccurrences, 50) }
      : { end_times: 0 };
  if (p.type === "monthly") {
    if (p.weekOfMonth != null && (p.daysOfWeek ?? []).length > 0) {
      return { type: 3, repeat_interval: p.interval ?? 1, monthly_week: p.weekOfMonth,
        monthly_week_day: ZOOM_WEEKDAY[(p.daysOfWeek ?? [])[0]] ?? 1, ...end };
    }
    if (p.dayOfMonth != null) {
      return { type: 3, repeat_interval: p.interval ?? 1, monthly_day: p.dayOfMonth, ...end };
    }
  }
  const days = (p.daysOfWeek ?? []).map((d) => ZOOM_WEEKDAY[d]).filter(Boolean);
  return { type: 2, repeat_interval: p.interval ?? 1, ...(days.length ? { weekly_days: days.join(",") } : {}), ...end };
}

// A recurring meeting's Zoom start_time is its next FUTURE occurrence, never the series
// anchor: Zoom silently rewrites a past start_time to "now" (verified 2026-08-20), and a
// backdated anchor (e.g. a lease-year import) would otherwise file the meeting under the
// host's past meetings.
function nextOccurrenceStart(meeting: IMeeting, family: IMeeting[] = []): Date {
  if (!meeting.isRecurring || !meeting.recurrencePattern) return new Date(meeting.startDateTime);
  const now = new Date();
  const horizon = new Date(now.getTime() + 370 * 24 * 60 * 60 * 1000);
  // A shared meeting's next occurrence is the earliest across ALL rows it serves.
  const siblings = zoomScheduleSiblings(meeting, family);
  const candidates = [meeting, ...siblings.filter((m) => m.isRecurring && m.recurrencePattern)]
    .map((m) => expandOccurrences(
      { ...m, recurrencePattern: m.recurrencePattern } as Parameters<typeof expandOccurrences>[0],
      now, horizon,
    )[0]?.start)
    .filter((d): d is Date => !!d);
  if (candidates.length === 0) return new Date(meeting.startDateTime);
  return candidates.reduce((a, b) => (a < b ? a : b));
}

// A lone meeting's Zoom topic names only Hybrid and Remote. "In Person" is deliberately absent:
// an in-person meeting has no Zoom meeting of its own to name, and only ever appears in a topic
// as one segment of a family that also meets online.
const ZOOM_SINGLE_TOPIC_SUFFIX: Record<string, string> = {
  Hybrid: "Hybrid",
  Remote: "Zoom Only",
};

// ICR's own Zoom naming convention, applied when no explicit zoomTopic is pinned. Adopted
// legacy meetings carry a pinned zoomTopic instead (their verbatim pre-app names) so an
// app-side edit can never rename them implicitly. Nothing writes the derived topic back into
// Meeting.zoomTopic: a null column keeps meaning "auto, recompute from the current family."
function zoomTopicFor(meeting: IMeeting, family: IMeeting[] = []): string {
  if (meeting.zoomTopic) return meeting.zoomTopic;
  return buildLinkedScheduleLabel(fellowshipPrefixedTitle(meeting), meeting, family, ZOOM_SINGLE_TOPIC_SUFFIX);
}

function buildZoomMeetingBody(meeting: IMeeting, family: IMeeting[] = []) {
  const durationMinutes = Math.round(
    (new Date(meeting.endDateTime).getTime() - new Date(meeting.startDateTime).getTime()) / 60000,
  );
  const recurrence = buildZoomRecurrence(meeting, family);
  if (recurrence === "incompatible") {
    // Divergent shared rows can't be one fixed-time series -- send a schedule-neutral body
    // (content only) so the PATCH can't narrow whatever union Zoom currently holds (#513).
    console.error(`Zoom shared-schedule rows for "${meeting.title}" diverged; leaving Zoom's schedule untouched`);
    return {
      topic: zoomTopicFor(meeting, family),
      duration: durationMinutes,
      agenda: meeting.description,
      settings: { host_video: true, participant_video: true, join_before_host: true },
    };
  }
  return {
    topic: zoomTopicFor(meeting, family),
    // Recurring series are real recurring meetings on Zoom (type 8, usually endless via
    // end_times: 0) -- one stable meeting ID across all occurrences, now with the schedule
    // visible in the host's portal. One-time meetings stay plain scheduled (type 2).
    type: recurrence ? 8 : 2,
    ...(recurrence ? { recurrence } : {}),
    start_time: toZoomStartTime(recurrence ? nextOccurrenceStart(meeting, family) : new Date(meeting.startDateTime)),
    duration: durationMinutes,
    timezone: "America/New_York",
    agenda: meeting.description,
    settings: { host_video: true, participant_video: true, join_before_host: true },
  };
}

// `family`: every live row of this meeting's linked-schedule family (getLinkedFamily), so the
// very first Zoom meeting is already minted with the union schedule and the family's topic --
// a family is only ever served by ONE Zoom meeting, created once.
export async function createZoomMeeting(meeting: IMeeting, hostEmail: string, family: IMeeting[] = []): Promise<{ zoomLink: string; zid: string; zoomPasscode: string | null } | null> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return null;
    if (!hostEmail) return null;

    const res = await fetch(`${ZOOM_BASE_API}/users/${encodeURIComponent(hostEmail)}/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildZoomMeetingBody(meeting, family)),
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

// Live join credentials straight from Zoom, for drift detection/reconciliation against the
// stored copy. Zoom is the source of truth for passcode/join URL -- a portal-side passcode
// change rewrites join_url's ?pwd= with no signal to the app (our PATCHes never send a
// password field, so they neither revert nor absorb it). null = couldn't fetch; callers must
// keep their stored values rather than treat an unreachable API as drift.
export async function getZoomMeetingCredentials(zid: string): Promise<{ passcode: string | null; joinUrl: string | null } | null> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return null;

    const res = await fetch(`${ZOOM_BASE_API}/meetings/${zid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    invalidateZoomTokenIfUnauthorized(res);
    if (!res.ok) {
      console.error("Zoom getMeetingCredentials error:", await res.text());
      return null;
    }
    const data = await res.json();
    // A passcode-less meeting comes back as password: "" -- normalized to null so drift
    // comparison and adoption both treat "no passcode" as one value, not two.
    return { passcode: data.password || null, joinUrl: data.join_url || null };
  } catch (error) {
    console.error("Zoom getMeetingCredentials error:", error);
    return null;
  }
}

export async function updateZoomMeeting(zid: string, meeting: IMeeting, family: IMeeting[] = []): Promise<boolean> {
  // Managed recurring meetings mirror their real schedule to Zoom (type 8 + recurrence, built
  // from the same pattern the app/calendars use) -- each successful PATCH also re-extends
  // Zoom's ~2-year rolling occurrence horizon. Unmanaged meetings never reach this function
  // (gated at every call site); their Zoom-side schedule is the owner's business.
  // family: this meeting's linked-schedule family (getLinkedFamily) -- the schedule sent is the
  // union of its Zoom-bearing rows, never one row's narrowed view (#513), and the topic is
  // recomputed from the family on every PATCH.

  try {
    const token = await getZoomAccessToken();
    if (!token) return false;

    const res = await fetch(`${ZOOM_BASE_API}/meetings/${zid}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildZoomMeetingBody(meeting, family)),
    });
    invalidateZoomTokenIfUnauthorized(res);
    if (!res.ok) console.error("Zoom updateMeeting error:", await res.text());
    return res.ok;
  } catch (error) {
    console.error("Zoom updateMeeting error:", error);
    return false;
  }
}

// Transfers an existing Zoom meeting to another host in place -- meeting ID, passcode, join URL
// and recurrence all survive (verified empirically 2026-08-20; Zoom answers 204). Zoom rejects
// this (400) unless the target host has granted scheduling privilege to the current host, and
// for any basic-tier host on either end, so callers must handle `false` rather than assume the
// move happened.
export async function rehostZoomMeeting(zid: string, hostEmail: string): Promise<boolean> {
  try {
    const token = await getZoomAccessToken();
    if (!token) return false;
    if (!hostEmail) return false;

    const res = await fetch(`${ZOOM_BASE_API}/meetings/${zid}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_for: hostEmail }),
    });
    invalidateZoomTokenIfUnauthorized(res);
    if (!res.ok) console.error("Zoom rehostMeeting error:", await res.text());
    return res.ok;
  } catch (error) {
    console.error("Zoom rehostMeeting error:", error);
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

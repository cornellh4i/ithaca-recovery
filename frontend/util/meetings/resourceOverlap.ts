import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { formatETDateString, isDstGapError } from "../date/timeUtils";
import { matchesRecurrencePattern, adjustOccurrenceToDate, isDateSuspended } from "./meetingOccurrences";

type SuspensionWindow = { from: Date; to: Date | null };

const notDeleted = { deletedAt: null };

// Zoom's type-2 meetings reuse one stable meeting ID forever across every future occurrence,
// so "does this candidate conflict with an existing recurring series" has no natural end
// point to check up to. Bounded to 2 years out as a practical horizon: far enough that a
// missed collision beyond it is an accepted residual gap (caught later by Diagnostics'
// periodic scan), not an attempt at an unbounded proof.
export const OVERLAP_HORIZON_YEARS = 2;

export type ResourceField = "room" | "zoomRoom" | "zoomHost";

// Deliberately mirrors IRecurrencePattern's optional/nullable shape (not
// matchesRecurrencePattern's stricter required-fields signature) so this type accepts both a
// Prisma-fetched RecurrencePattern and an IMeeting built from validated request/import data —
// expandOccurrences normalizes the optional fields before calling matchesRecurrencePattern.
type RecurrencePatternLike = {
  type: string;
  startDate: Date;
  endDate?: Date | null;
  interval: number;
  daysOfWeek?: string[] | null;
  weekOfMonth?: number | null;
  dayOfMonth?: number | null;
  excludedDates?: Date[] | null;
};

export type OccurrenceInput = {
  startDateTime: Date;
  endDateTime: Date;
  isRecurring: boolean;
  recurrencePattern?: RecurrencePatternLike | null;
};

export type Occurrence = { start: Date; end: Date };

export type ConflictCandidateMeeting = OccurrenceInput & {
  mid: string;
  title: string;
  room: string;
  zoomRoom?: string | null;
  zoomHost?: string | null;
  // The pool host an explicit pick collided with when zoomHost itself is null -- see the
  // attemptedZoomHost field comment in schema.prisma. Only ever a fallback: real zoomHost
  // values always take precedence when bucketing conflicts by field below.
  attemptedZoomHost?: string | null;
  status?: string | null;
  calType?: string[];
  suspensions?: SuspensionWindow[];
};

// Every occurrence of `meeting` that falls within [rangeStart, rangeEnd), sorted by start time.
// Non-recurring meetings expand to at most one occurrence. Recurring meetings are walked one
// ET calendar date at a time (same predicate getMeetingsForDate uses for a single date),
// bounded to ~730 iterations even for an open-ended (endDate: null) pattern at the 2-year
// horizon above.
export function expandOccurrences(
  meeting: OccurrenceInput,
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  if (!meeting.isRecurring || !meeting.recurrencePattern) {
    const start = new Date(meeting.startDateTime);
    const end = new Date(meeting.endDateTime);
    return start < rangeEnd && end > rangeStart ? [{ start, end }] : [];
  }

  const pattern = {
    type: meeting.recurrencePattern.type,
    startDate: meeting.recurrencePattern.startDate,
    endDate: meeting.recurrencePattern.endDate ?? null,
    interval: meeting.recurrencePattern.interval,
    daysOfWeek: meeting.recurrencePattern.daysOfWeek ?? [],
    weekOfMonth: meeting.recurrencePattern.weekOfMonth ?? null,
    dayOfMonth: meeting.recurrencePattern.dayOfMonth ?? null,
    excludedDates: meeting.recurrencePattern.excludedDates ?? [],
  };
  const patternStartStr = formatETDateString(new Date(pattern.startDate));
  const rangeStartStr = formatETDateString(rangeStart);
  const rangeEndStr = formatETDateString(rangeEnd);
  const patternEndStr = pattern.endDate ? formatETDateString(new Date(pattern.endDate)) : null;

  const startStr = patternStartStr > rangeStartStr ? patternStartStr : rangeStartStr;
  const endStr = patternEndStr && patternEndStr < rangeEndStr ? patternEndStr : rangeEndStr;
  if (startStr > endStr) return [];

  const [startYear, startMonth, startDay] = startStr.split("-").map(Number);
  const [endYear, endMonth, endDay] = endStr.split("-").map(Number);
  const startUTC = Date.UTC(startYear, startMonth - 1, startDay);
  const endUTC = Date.UTC(endYear, endMonth - 1, endDay);
  const msPerDay = 24 * 60 * 60 * 1000;

  const occurrences: Occurrence[] = [];
  for (let t = startUTC; t <= endUTC; t += msPerDay) {
    const localDate = new Date(t);
    const etDateStr = localDate.toISOString().slice(0, 10);

    if (!matchesRecurrencePattern(pattern, etDateStr, localDate)) continue;

    // adjustOccurrenceToDate throws when this occurrence's ET start/end time lands in the DST
    // spring-forward gap on this particular date -- isolated per-occurrence so one unrenderable
    // occurrence in a long expansion doesn't abort the whole conflict scan.
    try {
      const { start, end } = adjustOccurrenceToDate(meeting, etDateStr);
      occurrences.push({ start, end });
    } catch (err) {
      // Only the DST spring-forward gap is expected here -- any other error means a real bug,
      // which should surface, not get silently dropped alongside a merely-logged DST edge case.
      if (!isDstGapError(err)) throw err;
      console.warn(`Skipping occurrence on ${etDateStr}: ${err.message}`);
    }
  }

  return occurrences;
}

// Two-pointer sweep over two occurrence lists, each already sorted ascending by start (true
// for anything produced by expandOccurrences) — O(n+m) instead of the naive O(n*m). Returns
// the earliest overlapping pair (not just whether one exists) so callers that need to display
// the actual overlap window — e.g. the Diagnostics conflicts panel — don't have to re-sweep.
export function findOverlappingOccurrencePair(a: Occurrence[], b: Occurrence[]): { a: Occurrence; b: Occurrence } | null {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ai = a[i];
    const bj = b[j];
    if (ai.start < bj.end && bj.start < ai.end) return { a: ai, b: bj };
    if (ai.end <= bj.end) i++;
    else j++;
  }
  return null;
}

export function occurrencesOverlap(a: Occurrence[], b: Occurrence[]): boolean {
  return findOverlappingOccurrencePair(a, b) !== null;
}

// Capacity semantics are Zoom's own: a host with capacity k can run k meetings at once, so a
// candidate fits unless k *other* meetings already cover some single instant inside one of the
// candidate's occurrences. Overlap-anywhere-in-the-occurrence isn't enough — two existing
// meetings at disjoint times inside one long candidate occurrence never exceed k=2 at any
// instant, and rejecting that booking would be a false conflict.
//
// Returns the earliest instant-level over-capacity window (and who's active in it), or null if
// the candidate fits everywhere. `otherMeetings` is one occurrence list per distinct meeting —
// a single meeting's own back-to-back segments never count as two concurrent meetings.
export function findOverCapacityWindow(
  candidateOccurrences: Occurrence[],
  otherMeetings: Occurrence[][],
  capacity: number,
): { window: Occurrence; meetingIndexes: number[]; candidateOccurrence: Occurrence } | null {
  for (const cand of candidateOccurrences) {
    const events: { time: number; delta: 1 | -1; idx: number }[] = [];
    for (let m = 0; m < otherMeetings.length; m++) {
      for (const occ of otherMeetings[m]) {
        const start = occ.start > cand.start ? occ.start : cand.start;
        const end = occ.end < cand.end ? occ.end : cand.end;
        if (start < end) {
          events.push({ time: start.getTime(), delta: 1, idx: m });
          events.push({ time: end.getTime(), delta: -1, idx: m });
        }
      }
    }
    if (events.length === 0) continue;
    // Ends sort before starts at the same timestamp so back-to-back intervals (end === start)
    // never read as concurrent.
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);

    // meetingIndex -> open segment count, so one meeting's overlapping segments (possible for
    // a pathological pattern) still count as a single concurrent meeting.
    const active = new Map<number, number>();
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      if (ev.delta === 1) {
        active.set(ev.idx, (active.get(ev.idx) ?? 0) + 1);
      } else {
        const n = (active.get(ev.idx) ?? 0) - 1;
        if (n <= 0) active.delete(ev.idx);
        else active.set(ev.idx, n);
      }
      if (active.size >= capacity) {
        const nextDistinct = events.find((later) => later.time > ev.time);
        return {
          window: {
            start: new Date(ev.time),
            end: new Date(nextDistinct ? nextDistinct.time : cand.end.getTime()),
          },
          meetingIndexes: [...active.keys()],
          candidateOccurrence: cand,
        };
      }
    }
  }
  return null;
}

// [rangeStart, rangeEnd) used by computeConflicts (the Diagnostics dashboard scan): from now
// out to the horizon. Candidates and existing meetings alike are expected to be present/future
// there — a meeting that already started in the past falling outside this window is
// intentional, not a bug (there's nothing to conflict with about a booking that's already
// happened, and nobody needs Diagnostics to keep nagging about it).
const horizonRange = (horizonYears: number): [Date, Date] => {
  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCFullYear(rangeEnd.getUTCFullYear() + horizonYears);
  return [rangeStart, rangeEnd];
};

// [rangeStart, rangeEnd) used by findResourceConflicts/findResourceConflictRows — the write/
// update-time checks for one specific candidate's chosen room/zoomRoom/zoomHost. Unlike
// computeConflicts above, these must still catch a conflict against a same-day slot that has
// already elapsed by the time the request is checked (e.g. saving a 6-7pm meeting at 8pm) — the
// two records genuinely overlap in the data regardless of the current wall-clock time.
// horizonYears into the past is a generous, symmetric bound (matching the future side) rather
// than a precisely-reasoned one; nothing bounds the loop tighter than that for a recurring
// meeting anyway (see expandOccurrences' own patternStart-vs-rangeStart clamping).
const candidateHorizonRange = (horizonYears: number): [Date, Date] => {
  const rangeStart = new Date();
  rangeStart.setUTCFullYear(rangeStart.getUTCFullYear() - horizonYears);
  const rangeEnd = new Date();
  rangeEnd.setUTCFullYear(rangeEnd.getUTCFullYear() + horizonYears);
  return [rangeStart, rangeEnd];
};

const fieldWhere = (field: ResourceField, value: string): Prisma.MeetingWhereInput => {
  if (field === "room") return { room: value };
  if (field === "zoomRoom") return { zoomRoom: value };
  return { zoomHost: value };
};

export type FindConflictsOptions = {
  // Exclude this meeting (by mid) from the query — used when re-checking a meeting against
  // itself during an update.
  excludeMid?: string;
  // Suspended meetings still occupy their Zoom host (sync is skipped while suspended, not
  // torn down) but shouldn't nag admins on the room/zoomRoom conflicts panel. Default false.
  includeSuspended?: boolean;
  // How many concurrent meetings the checked resource can carry (see findOverCapacityWindow's
  // semantics). Defaults to 1 — rooms and Zoom rooms are physical spaces; only licensed Zoom
  // hosts (capacity 2 per Zoom's own account rules, see services/zoom.ts) ever pass more.
  capacity?: number;
};

// Finds every existing meeting occupying `field = value` whose occurrences overlap
// `candidate`'s, within the candidate horizon window above.
// `client` is required (not defaulted to the global singleton) deliberately -- callers running
// inside a lockResourceClaims-guarded transaction (see util/resourceLocks.ts) must pass their
// `tx` so this check runs on the same DB session the advisory lock was acquired on, and every
// other caller must explicitly pass the global `prisma` so it's visible at the call site (and
// in review) which check is/isn't protected by the transaction, rather than that being an
// invisible default a future edit could silently get wrong.
export async function findResourceConflicts(
  field: ResourceField,
  value: string,
  candidate: OccurrenceInput,
  client: Prisma.TransactionClient,
  opts: FindConflictsOptions = {},
): Promise<{ mid: string; title: string }[]> {
  if (!value) return [];

  const [rangeStart, rangeEnd] = candidateHorizonRange(OVERLAP_HORIZON_YEARS);
  const candidateOccurrences = expandOccurrences(candidate, rangeStart, rangeEnd);
  if (candidateOccurrences.length === 0) return [];

  const where: Prisma.MeetingWhereInput = {
    AND: [
      notDeleted,
      fieldWhere(field, value),
      ...(opts.excludeMid ? [{ mid: { not: opts.excludeMid } }] : []),
    ],
  };

  const todayStr = formatETDateString(new Date());
  const meetingsRaw = await client.meeting.findMany({
    where,
    select: {
      mid: true,
      title: true,
      startDateTime: true,
      endDateTime: true,
      isRecurring: true,
      recurrencePattern: true,
      suspensions: true,
    },
  });
  const meetings = opts.includeSuspended
    ? meetingsRaw
    : meetingsRaw.filter((m) => !isDateSuspended(m.suspensions, todayStr));

  const occurrenceLists = meetings.map((meeting) =>
    expandOccurrences(
      {
        startDateTime: meeting.startDateTime,
        endDateTime: meeting.endDateTime,
        isRecurring: meeting.isRecurring,
        recurrencePattern: meeting.recurrencePattern,
      },
      rangeStart,
      rangeEnd,
    ),
  );

  // Capacity > 1 (a licensed Zoom host): the value is only unavailable when `capacity` other
  // meetings share an instant inside a candidate occurrence — callers treat a non-empty return
  // as "unavailable", so return the over-capacity window's members, or [] when the candidate
  // still fits (#446).
  const capacity = opts.capacity ?? 1;
  if (capacity > 1) {
    const over = findOverCapacityWindow(candidateOccurrences, occurrenceLists, capacity);
    return over ? over.meetingIndexes.map((i) => ({ mid: meetings[i].mid, title: meetings[i].title })) : [];
  }

  const conflicts: { mid: string; title: string }[] = [];
  for (let i = 0; i < meetings.length; i++) {
    if (occurrencesOverlap(candidateOccurrences, occurrenceLists[i])) {
      conflicts.push({ mid: meetings[i].mid, title: meetings[i].title });
    }
  }

  return conflicts;
}

// The largest number of `otherMeetings` covering any single instant inside any of the
// candidate's occurrences — the load figure behind both host assignment (spare capacity =
// capacity minus this) and the Meeting Form's per-host free-slot display. Same instant-level
// semantics as findOverCapacityWindow above; 0 when nothing overlaps.
export function maxConcurrentDuring(
  candidateOccurrences: Occurrence[],
  otherMeetings: Occurrence[][],
): number {
  let max = 0;
  for (const cand of candidateOccurrences) {
    const events: { time: number; delta: 1 | -1; idx: number }[] = [];
    for (let m = 0; m < otherMeetings.length; m++) {
      for (const occ of otherMeetings[m]) {
        const start = occ.start > cand.start ? occ.start : cand.start;
        const end = occ.end < cand.end ? occ.end : cand.end;
        if (start < end) {
          events.push({ time: start.getTime(), delta: 1, idx: m });
          events.push({ time: end.getTime(), delta: -1, idx: m });
        }
      }
    }
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);
    const active = new Map<number, number>();
    for (const ev of events) {
      if (ev.delta === 1) active.set(ev.idx, (active.get(ev.idx) ?? 0) + 1);
      else {
        const n = (active.get(ev.idx) ?? 0) - 1;
        if (n <= 0) active.delete(ev.idx);
        else active.set(ev.idx, n);
      }
      if (active.size > max) max = active.size;
    }
  }
  return max;
}

export type PoolHostOptions = FindConflictsOptions & {
  // Per-host concurrent-meeting capacity (licensed hosts carry 2, basic 1 — resolved by
  // services/zoom.ts's getZoomHostCapacities BEFORE the caller enters its locked transaction,
  // so no external call ever runs while pool locks are held). Hosts missing from the map
  // fail safe to capacity 1.
  capacities?: Record<string, number>;
};

// Picks a host with spare capacity against `candidate`'s occurrences, ordered as tiered
// least-connections (#471): licensed hosts (capacity >= 2) strictly before basic ones — a
// basic host silently caps meetings at 40 minutes (see services/zoom.ts's checkZoomHostPool),
// so it's a last resort, never an equal peer — then fewest concurrent meetings at the
// candidate's peak within the tier (spreading shrinks the blast radius of a host outage or
// downgrade), then pool list order as a deterministic tie-break (list order stays an admin
// lever). The batched counterpart to calling findResourceConflicts once per pool host: one
// query (`zoomHost: { in: pool }`) instead of up to `pool.length`, and the candidate's own
// occurrences are expanded once and reused across every host, instead of once per query. `client`
// must be the same `tx` a caller's `lockResourceClaims` call locked every pool host on (see
// util/resourceLocks.ts) -- same reasoning as findResourceConflicts' own `client` param above.
// The capacity check MUST stay inside that locked transaction: "count < capacity" is a wider
// read-then-decide TOCTOU surface than the old binary busy check (#360/#446).
// Returns null if every host is at capacity (pool exhausted).
export async function findFirstFreePoolHost(
  pool: string[],
  candidate: OccurrenceInput,
  client: Prisma.TransactionClient,
  opts: PoolHostOptions = {},
): Promise<string | null> {
  if (pool.length === 0) return null;

  const loads = await getPoolHostLoads(pool, candidate, client, opts);
  const ranked = loads
    .map((load, poolIndex) => ({ ...load, poolIndex, capacity: opts.capacities?.[load.host] ?? 1 }))
    .filter(({ peak, capacity }) => peak < capacity)
    .sort((a, b) =>
      // Licensed tier (capacity >= 2) first, then least-loaded, then pool order.
      (a.capacity >= 2 ? 0 : 1) - (b.capacity >= 2 ? 0 : 1) ||
      a.peak - b.peak ||
      a.poolIndex - b.poolIndex,
    );

  return ranked[0]?.host ?? null;
}

// Per-host peak concurrency against `candidate`, in pool order — the shared load figure
// behind findFirstFreePoolHost's ranking above and the Meeting Form's per-host free-slot
// display (services/zoom.ts's checkZoomHostPoolAvailability). One batched query for the whole
// pool; `client` follows the same required-explicitly rule as findResourceConflicts above.
export async function getPoolHostLoads(
  pool: string[],
  candidate: OccurrenceInput,
  client: Prisma.TransactionClient,
  opts: FindConflictsOptions = {},
): Promise<{ host: string; peak: number }[]> {
  if (pool.length === 0) return [];

  const [rangeStart, rangeEnd] = candidateHorizonRange(OVERLAP_HORIZON_YEARS);
  const candidateOccurrences = expandOccurrences(candidate, rangeStart, rangeEnd);
  // Zero peaks, not an early host pick -- findFirstFreePoolHost's tiered ranking still runs
  // over these, so a candidate whose occurrences fall outside the horizon window gets a
  // licensed host first rather than whatever host is first in the pool.
  if (candidateOccurrences.length === 0) return pool.map((host) => ({ host, peak: 0 }));

  const where: Prisma.MeetingWhereInput = {
    AND: [
      notDeleted,
      { zoomHost: { in: pool } },
      ...(opts.excludeMid ? [{ mid: { not: opts.excludeMid } }] : []),
    ],
  };

  const todayStr = formatETDateString(new Date());
  const meetingsRaw = await client.meeting.findMany({
    where,
    select: {
      zoomHost: true,
      startDateTime: true,
      endDateTime: true,
      isRecurring: true,
      recurrencePattern: true,
      suspensions: true,
    },
  });
  const meetings = opts.includeSuspended
    ? meetingsRaw
    : meetingsRaw.filter((m) => !isDateSuspended(m.suspensions, todayStr));

  const occupiedByHost = new Map<string, typeof meetings>();
  for (const meeting of meetings) {
    if (!meeting.zoomHost) continue;
    const bucket = occupiedByHost.get(meeting.zoomHost);
    if (bucket) bucket.push(meeting);
    else occupiedByHost.set(meeting.zoomHost, [meeting]);
  }

  return pool.map((host) => {
    const hostOccurrenceLists = (occupiedByHost.get(host) ?? []).map((meeting) =>
      expandOccurrences(
        {
          startDateTime: meeting.startDateTime,
          endDateTime: meeting.endDateTime,
          isRecurring: meeting.isRecurring,
          recurrencePattern: meeting.recurrencePattern,
        },
        rangeStart,
        rangeEnd,
      ),
    );
    return { host, peak: maxConcurrentDuring(candidateOccurrences, hostOccurrenceLists) };
  });
}

// The display-relevant subset of a meeting's recurrence pattern (no Date fields — those
// don't survive JSON serialization cleanly and callers only need this to build text like
// "Weekly · Tue" or "Monthly · 2nd Fri").
export type ConflictRecurrenceSummary = {
  type: string;
  interval: number;
  daysOfWeek: string[];
  weekOfMonth: number | null;
  dayOfMonth: number | null;
};

export type ConflictMeetingSummary = {
  mid: string;
  title: string;
  calType: string[];
  isRecurring: boolean;
  recurrencePattern: ConflictRecurrenceSummary | null;
  // This meeting's own occurrence from the overlapping pair -- not the overlap intersection
  // (which may be a subset when the two meetings' times differ) -- so the panel can show each
  // meeting's actual scheduled time.
  occurrence: { start: Date; end: Date };
};

export type ConflictRow = {
  field: "room" | "zoomRoom" | "zoomHost";
  value: string;
  // The earliest window where the listed meetings' occurrences actually intersect (not just
  // any one meeting's own start/end) — e.g. two meetings 7:00-8:00 and 7:30-8:30 overlap
  // 7:30-8:00.
  overlap: { start: Date; end: Date };
  // 2+ meetings. Capacity-1 resources (room/zoomRoom) still produce pairs; a capacity-2 Zoom
  // host produces a row only when 3+ meetings share an instant — two meetings on one licensed
  // host is healthy and is deliberately NOT a conflict (#446).
  meetings: ConflictMeetingSummary[];
};

// Thrown from inside a lockResourceClaims-guarded prisma.$transaction callback to abort the
// transaction (Prisma rolls back automatically on a thrown error) and carry the conflict rows
// back out to the route handler, which turns this into the existing 409 response shape. Using
// an exception rather than a sentinel return value keeps the transaction callback's happy path
// a plain return of the created/updated meeting, instead of every caller needing to check a
// discriminated result on every return.
export class ResourceConflictAbort extends Error {
  constructor(public readonly conflicts: ConflictRow[]) {
    super("Resource conflict");
    this.name = "ResourceConflictAbort";
  }
}

const toRecurrenceSummary = (meeting: ConflictCandidateMeeting): ConflictRecurrenceSummary | null => {
  if (!meeting.isRecurring || !meeting.recurrencePattern) return null;
  const pattern = meeting.recurrencePattern;
  return {
    type: pattern.type,
    interval: pattern.interval,
    daysOfWeek: pattern.daysOfWeek ?? [],
    weekOfMonth: pattern.weekOfMonth ?? null,
    dayOfMonth: pattern.dayOfMonth ?? null,
  };
};

const toMeetingSummary = (meeting: ConflictCandidateMeeting, occurrence: Occurrence): ConflictMeetingSummary => ({
  mid: meeting.mid,
  title: meeting.title,
  calType: meeting.calType ?? [],
  isRecurring: meeting.isRecurring,
  recurrencePattern: toRecurrenceSummary(meeting),
  occurrence: { start: occurrence.start, end: occurrence.end },
});

export type ComputeConflictsOptions = {
  // Per-host concurrent-meeting capacity for the zoomHost buckets (licensed = 2, basic = 1;
  // see services/zoom.ts's getZoomHostCapacities). Hosts missing from the map fail safe to
  // capacity 1. room/zoomRoom are always capacity 1 — physical spaces.
  zoomHostCapacities?: Record<string, number>;
};

// Pure/synchronous — groups a pre-fetched meeting list by room, zoomRoom, and zoomHost, and
// checks each bucket for over-capacity overlaps (capacity 1 = plain pairwise overlap). Kept
// DB-free (caller does the one Prisma query and resolves host capacities) so this stays
// unit-testable without a database. Suspended meetings are excluded from the
// room/zoomRoom checks: this feeds the Diagnostics conflicts panel, an admin scheduling tool
// with no reason to flag a room/Zoom-room conflict for a meeting that isn't currently running.
// zoomHost is the one exception -- a suspended meeting's Zoom sync is skipped, not torn down
// (see resolveZoomHost/findResourceConflicts' own includeSuspended: true), so its Zoom host is
// still genuinely reserved and a real scheduling conflict for another meeting at that time.
export function computeConflicts(
  meetings: ConflictCandidateMeeting[],
  horizonYears: number = OVERLAP_HORIZON_YEARS,
  opts: ComputeConflictsOptions = {},
): ConflictRow[] {
  const [rangeStart, rangeEnd] = horizonRange(horizonYears);
  const todayStr = formatETDateString(new Date());
  const activeMeetings = meetings.filter((m) => !isDateSuspended(m.suspensions ?? [], todayStr));
  const conflicts: ConflictRow[] = [];

  // A meeting occupies up to three resource fields (room, zoomRoom, zoomHost) and lands in one
  // bucket per field — expanding its occurrences is the expensive part (a day-by-day walk over
  // the whole horizon), so expand once per meeting per scan, not once per field.
  const expansionCache = new Map<ConflictCandidateMeeting, Occurrence[]>();
  const expandCached = (meeting: ConflictCandidateMeeting): Occurrence[] => {
    let occurrences = expansionCache.get(meeting);
    if (!occurrences) {
      occurrences = expandOccurrences(meeting, rangeStart, rangeEnd);
      expansionCache.set(meeting, occurrences);
    }
    return occurrences;
  };

  const fieldMeetings: Record<"room" | "zoomRoom" | "zoomHost", ConflictCandidateMeeting[]> = {
    room: activeMeetings,
    zoomRoom: activeMeetings,
    zoomHost: meetings,
  };

  (["room", "zoomRoom", "zoomHost"] as const).forEach((field) => {
    const buckets = new Map<string, ConflictCandidateMeeting[]>();
    for (const meeting of fieldMeetings[field]) {
      // A meeting whose explicit zoomHost pick lost out to another meeting has zoomHost: null
      // (nothing was actually assigned) but still real-y wants that host -- bucket it under
      // attemptedZoomHost so it still pairs up against whoever holds it, instead of the
      // already-known conflict (see its zoomSyncError) silently vanishing from this panel.
      const value = field === "zoomHost" ? (meeting.zoomHost ?? meeting.attemptedZoomHost) : meeting[field];
      if (!value) continue;
      const bucket = buckets.get(value);
      if (bucket) bucket.push(meeting);
      else buckets.set(value, [meeting]);
    }

    for (const [value, bucketMeetings] of buckets) {
      const capacity = field === "zoomHost" ? (opts.zoomHostCapacities?.[value] ?? 1) : 1;
      const withOccurrences = bucketMeetings.map((meeting) => ({
        meeting,
        occurrences: expandCached(meeting),
      }));

      if (capacity <= 1) {
        for (let i = 0; i < withOccurrences.length; i++) {
          for (let j = i + 1; j < withOccurrences.length; j++) {
            const pair = findOverlappingOccurrencePair(withOccurrences[i].occurrences, withOccurrences[j].occurrences);
            if (pair) {
              conflicts.push({
                field,
                value,
                overlap: {
                  start: pair.a.start > pair.b.start ? pair.a.start : pair.b.start,
                  end: pair.a.end < pair.b.end ? pair.a.end : pair.b.end,
                },
                meetings: [
                  toMeetingSummary(withOccurrences[i].meeting, pair.a),
                  toMeetingSummary(withOccurrences[j].meeting, pair.b),
                ],
              });
            }
          }
        }
        continue;
      }

      // capacity >= 2: over-capacity means MORE than `capacity` meetings sharing one instant —
      // `capacity` concurrent meetings on a licensed host is healthy and must not be flagged.
      // Rows group the way the calendar's own "+N" clusters do: one row per continuous
      // transitive-overlap cluster (back-to-back occurrences don't chain), so a messy chain
      // never spawns several near-identical rows. A row's meetings are the cluster members
      // that participate in at least one over-capacity instant — a meeting merely chained
      // onto the cluster but never concurrent at a peak isn't dragged in (moving it can't
      // resolve anything). `overlap` is the cluster's earliest over-capacity window.
      const events: { time: number; delta: 1 | -1; idx: number }[] = [];
      withOccurrences.forEach(({ occurrences }, idx) => {
        for (const occ of occurrences) {
          events.push({ time: occ.start.getTime(), delta: 1, idx });
          events.push({ time: occ.end.getTime(), delta: -1, idx });
        }
      });
      events.sort((a, b) => a.time - b.time || a.delta - b.delta);

      const active = new Map<number, number>();
      let overMembers = new Set<number>();
      let overWindow: { start: number; end: number } | null = null;
      const closeCluster = () => {
        if (overWindow && overMembers.size > 0) {
          const windowStartMs = overWindow.start;
          conflicts.push({
            field,
            value,
            overlap: { start: new Date(overWindow.start), end: new Date(overWindow.end) },
            meetings: [...overMembers].sort((a, b) => a - b).map((i) => {
              // Each member's own occurrence covering the window start where possible; a member
              // of a later peak in the same cluster falls back to its first occurrence.
              const own = withOccurrences[i].occurrences.find(
                (occ) => occ.start.getTime() <= windowStartMs && occ.end.getTime() > windowStartMs,
              ) ?? withOccurrences[i].occurrences[0];
              return toMeetingSummary(withOccurrences[i].meeting, own);
            }),
          });
        }
        overMembers = new Set();
        overWindow = null;
      };
      for (let e = 0; e < events.length; e++) {
        const ev = events[e];
        if (ev.delta === 1) {
          active.set(ev.idx, (active.get(ev.idx) ?? 0) + 1);
        } else {
          const n = (active.get(ev.idx) ?? 0) - 1;
          if (n <= 0) active.delete(ev.idx);
          else active.set(ev.idx, n);
        }
        if (active.size > capacity) {
          for (const idx of active.keys()) overMembers.add(idx);
          if (!overWindow) {
            const nextDistinct = events.find((later) => later.time > ev.time);
            overWindow = { start: ev.time, end: nextDistinct ? nextDistinct.time : ev.time };
          }
        }
        // Cluster boundary: the sweep drained to zero (ends sort before starts, so a
        // back-to-back handoff passes through zero here and correctly splits the chain).
        if (active.size === 0) closeCluster();
      }
      closeCluster();
    }
  });

  return conflicts;
}

// Single-candidate version of computeConflicts, scoped to one resource field/value -- used by
// write/meeting and update/meeting to block a save that collides on room, zoomRoom, or a
// manually-picked zoomHost, showing what it collides with (unlike findResourceConflicts above,
// which only returns bare {mid,title}[] and is used by the pool-auto-assignment check-and-defer
// path, a different, non-blocking flow -- pool exhaustion has no "other value to pick instead"
// the way a room/zoomHost conflict does, so it stays fail-soft). room/zoomRoom and zoomHost
// differ in one respect the caller must get right: a suspended meeting doesn't block a room
// (matching computeConflicts' own activeMeetings filtering), but its Zoom host reservation is
// still live (sync is skipped while suspended, not torn down) -- callers must pass
// `includeSuspended: true` for a `zoomHost` check, `false`/omitted for `room`/`zoomRoom`.
// `client` is required (not defaulted to the global singleton) deliberately -- see
// findResourceConflicts' comment above for why.
export async function findResourceConflictRows(
  field: ResourceField,
  value: string,
  candidate: ConflictCandidateMeeting,
  client: Prisma.TransactionClient,
  opts: FindConflictsOptions = {},
): Promise<ConflictRow[]> {
  if (!value) return [];

  const [rangeStart, rangeEnd] = candidateHorizonRange(OVERLAP_HORIZON_YEARS);
  const candidateOccurrences = expandOccurrences(candidate, rangeStart, rangeEnd);
  if (candidateOccurrences.length === 0) return [];

  const where: Prisma.MeetingWhereInput = {
    AND: [
      notDeleted,
      fieldWhere(field, value),
      ...(opts.excludeMid ? [{ mid: { not: opts.excludeMid } }] : []),
    ],
  };

  const meetings = await client.meeting.findMany({
    where,
    select: {
      mid: true,
      title: true,
      calType: true,
      startDateTime: true,
      endDateTime: true,
      isRecurring: true,
      recurrencePattern: true,
      suspensions: true,
    },
  });

  const capacity = opts.capacity ?? 1;
  if (capacity > 1) {
    // Capacity-aware path (an explicitly-picked licensed Zoom host): the pick is only blocked
    // when `capacity` other meetings already cover some instant of a candidate occurrence —
    // sharing the host with capacity-1 others is healthy (#446). Emits a single N-way row
    // (candidate + the meetings active in the earliest over-capacity window) instead of the
    // capacity-1 path's one-pair-per-meeting rows.
    const withOccurrences = meetings.map((meeting) => {
      let occurrences = expandOccurrences(
        {
          startDateTime: meeting.startDateTime,
          endDateTime: meeting.endDateTime,
          isRecurring: meeting.isRecurring,
          recurrencePattern: meeting.recurrencePattern,
        },
        rangeStart,
        rangeEnd,
      );
      if (!opts.includeSuspended) {
        occurrences = occurrences.filter((occ) => !isDateSuspended(meeting.suspensions, formatETDateString(occ.start)));
      }
      return { meeting, occurrences };
    });

    const over = findOverCapacityWindow(
      candidateOccurrences,
      withOccurrences.map((m) => m.occurrences),
      capacity,
    );
    if (!over) return [];

    const windowStartMs = over.window.start.getTime();
    return [{
      field,
      value,
      overlap: over.window,
      meetings: [
        toMeetingSummary(candidate, over.candidateOccurrence),
        ...over.meetingIndexes.map((i) => {
          const { meeting, occurrences } = withOccurrences[i];
          const own = occurrences.find(
            (occ) => occ.start.getTime() <= windowStartMs && occ.end.getTime() > windowStartMs,
          ) ?? occurrences[0];
          const summarySource: ConflictCandidateMeeting = {
            mid: meeting.mid,
            title: meeting.title,
            room: field === "room" ? value : "",
            zoomRoom: field === "zoomRoom" ? value : null,
            zoomHost: field === "zoomHost" ? value : null,
            calType: meeting.calType,
            startDateTime: meeting.startDateTime,
            endDateTime: meeting.endDateTime,
            isRecurring: meeting.isRecurring,
            recurrencePattern: meeting.recurrencePattern,
          };
          return toMeetingSummary(summarySource, own);
        }),
      ],
    }];
  }

  const rows: ConflictRow[] = [];
  for (const meeting of meetings) {
    // room/zoomRoom/zoomHost placeholders below are never read by toMeetingSummary/
    // toRecurrenceSummary (mid/title/calType/isRecurring/recurrencePattern only) -- they exist
    // purely to satisfy ConflictCandidateMeeting's required `room` field.
    const existingCandidate: ConflictCandidateMeeting = {
      mid: meeting.mid,
      title: meeting.title,
      room: field === "room" ? value : "",
      zoomRoom: field === "zoomRoom" ? value : null,
      zoomHost: field === "zoomHost" ? value : null,
      calType: meeting.calType,
      startDateTime: meeting.startDateTime,
      endDateTime: meeting.endDateTime,
      isRecurring: meeting.isRecurring,
      recurrencePattern: meeting.recurrencePattern,
    };
    let occurrences = expandOccurrences(existingCandidate, rangeStart, rangeEnd);
    // Filtered per-occurrence, not per-meeting -- a meeting suspended today but resumed before
    // a later candidate occurrence still genuinely occupies the room then, and a meeting with a
    // future suspension window shouldn't block a booking that falls inside it. Matches
    // computeConflicts' own room/zoomRoom semantics (a suspended meeting doesn't block a room),
    // just evaluated against each occurrence's own date instead of today's.
    if (!opts.includeSuspended) {
      occurrences = occurrences.filter((occ) => !isDateSuspended(meeting.suspensions, formatETDateString(occ.start)));
    }
    const pair = findOverlappingOccurrencePair(candidateOccurrences, occurrences);
    if (pair) {
      rows.push({
        field,
        value,
        overlap: {
          start: pair.a.start > pair.b.start ? pair.a.start : pair.b.start,
          end: pair.a.end < pair.b.end ? pair.a.end : pair.b.end,
        },
        meetings: [toMeetingSummary(candidate, pair.a), toMeetingSummary(existingCandidate, pair.b)],
      });
    }
  }

  return rows;
}

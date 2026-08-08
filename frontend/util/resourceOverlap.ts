import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { formatETDateString } from "./date/timeUtils";
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

// `value` is the resource value this claim occupies (a room name, zoomRoom name, or host
// email) — findResourceConflicts only counts a claim against a query for the same value, so
// one flat list of a batch's claims-so-far can be reused across every field/value check.
export type OccupiedClaim = OccurrenceInput & { mid: string; title: string; value: string };

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

    const { start, end } = adjustOccurrenceToDate(meeting, etDateStr);
    occurrences.push({ start, end });
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
  // In-memory claims not yet committed to the DB — used by the XLSX import route to avoid two
  // rows in the same batch racing for the same resource before either has been created.
  extraOccupied?: OccupiedClaim[];
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

  const conflicts: { mid: string; title: string }[] = [];
  for (const meeting of meetings) {
    const occurrences = expandOccurrences(
      {
        startDateTime: meeting.startDateTime,
        endDateTime: meeting.endDateTime,
        isRecurring: meeting.isRecurring,
        recurrencePattern: meeting.recurrencePattern,
      },
      rangeStart,
      rangeEnd,
    );
    if (occurrencesOverlap(candidateOccurrences, occurrences)) {
      conflicts.push({ mid: meeting.mid, title: meeting.title });
    }
  }

  for (const claim of opts.extraOccupied ?? []) {
    if (claim.value !== value) continue;
    const occurrences = expandOccurrences(claim, rangeStart, rangeEnd);
    if (occurrencesOverlap(candidateOccurrences, occurrences)) {
      conflicts.push({ mid: claim.mid, title: claim.title });
    }
  }

  return conflicts;
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
  // The earliest window where the two meetings' occurrences actually intersect (not just
  // either meeting's own start/end) — e.g. two meetings 7:00-8:00 and 7:30-8:30 overlap
  // 7:30-8:00.
  overlap: { start: Date; end: Date };
  meetings: [ConflictMeetingSummary, ConflictMeetingSummary];
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

// Pure/synchronous — groups a pre-fetched meeting list by room, zoomRoom, and zoomHost, and
// pairwise-checks each bucket for overlaps. Kept DB-free (caller does the one Prisma query)
// so this stays unit-testable without a database. Suspended meetings are excluded from the
// room/zoomRoom checks: this feeds the Diagnostics conflicts panel, an admin scheduling tool
// with no reason to flag a room/Zoom-room conflict for a meeting that isn't currently running.
// zoomHost is the one exception -- a suspended meeting's Zoom sync is skipped, not torn down
// (see resolveZoomHost/findResourceConflicts' own includeSuspended: true), so its Zoom host is
// still genuinely reserved and a real scheduling conflict for another meeting at that time.
export function computeConflicts(
  meetings: ConflictCandidateMeeting[],
  horizonYears: number = OVERLAP_HORIZON_YEARS,
): ConflictRow[] {
  const [rangeStart, rangeEnd] = horizonRange(horizonYears);
  const todayStr = formatETDateString(new Date());
  const activeMeetings = meetings.filter((m) => !isDateSuspended(m.suspensions ?? [], todayStr));
  const conflicts: ConflictRow[] = [];

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
      const withOccurrences = bucketMeetings.map((meeting) => ({
        meeting,
        occurrences: expandOccurrences(meeting, rangeStart, rangeEnd),
      }));

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

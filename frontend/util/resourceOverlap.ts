import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { formatETDateString } from "./timeUtils";
import { matchesRecurrencePattern, adjustOccurrenceToDate } from "./meetingOccurrences";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

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
  status?: string | null;
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
// for anything produced by expandOccurrences) — O(n+m) instead of the naive O(n*m).
export function occurrencesOverlap(a: Occurrence[], b: Occurrence[]): boolean {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ai = a[i];
    const bj = b[j];
    if (ai.start < bj.end && bj.start < ai.end) return true;
    if (ai.end <= bj.end) i++;
    else j++;
  }
  return false;
}

// [rangeStart, rangeEnd) shared by every conflict check in this module: from now out to the
// 2-year horizon. Candidates and existing meetings alike are expected to be present/future —
// a meeting that already started in the past falling outside this window is intentional, not
// a bug (there's nothing to conflict with about a booking that's already happened).
const horizonRange = (horizonYears: number): [Date, Date] => {
  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart);
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
// `candidate`'s, within the shared horizon window above.
export async function findResourceConflicts(
  field: ResourceField,
  value: string,
  candidate: OccurrenceInput,
  opts: FindConflictsOptions = {},
): Promise<{ mid: string; title: string }[]> {
  if (!value) return [];

  const [rangeStart, rangeEnd] = horizonRange(OVERLAP_HORIZON_YEARS);
  const candidateOccurrences = expandOccurrences(candidate, rangeStart, rangeEnd);
  if (candidateOccurrences.length === 0) return [];

  const where: Prisma.MeetingWhereInput = {
    AND: [
      notDeleted,
      fieldWhere(field, value),
      ...(opts.excludeMid ? [{ mid: { not: opts.excludeMid } }] : []),
      ...(opts.includeSuspended ? [] : [{ status: { not: "Suspended" } }]),
    ],
  };

  const meetings = await prisma.meeting.findMany({ where, include: { recurrencePattern: true } });

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

export type ConflictRow = {
  field: "room" | "zoomRoom";
  value: string;
  meetings: { mid: string; title: string }[];
};

// Pure/synchronous — groups a pre-fetched meeting list by room and by zoomRoom and
// pairwise-checks each bucket for overlaps. Kept DB-free (caller does the one Prisma query)
// so this stays unit-testable without a database. Suspended meetings are excluded: this feeds
// the Diagnostics conflicts panel, an admin scheduling tool with no reason to flag a meeting
// that isn't currently running.
export function computeConflicts(
  meetings: ConflictCandidateMeeting[],
  horizonYears: number = OVERLAP_HORIZON_YEARS,
): ConflictRow[] {
  const [rangeStart, rangeEnd] = horizonRange(horizonYears);
  const activeMeetings = meetings.filter((m) => m.status !== "Suspended");
  const conflicts: ConflictRow[] = [];

  (["room", "zoomRoom"] as const).forEach((field) => {
    const buckets = new Map<string, ConflictCandidateMeeting[]>();
    for (const meeting of activeMeetings) {
      const value = meeting[field];
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
          if (occurrencesOverlap(withOccurrences[i].occurrences, withOccurrences[j].occurrences)) {
            conflicts.push({
              field,
              value,
              meetings: [
                { mid: withOccurrences[i].meeting.mid, title: withOccurrences[i].meeting.title },
                { mid: withOccurrences[j].meeting.mid, title: withOccurrences[j].meeting.title },
              ],
            });
          }
        }
      }
    }
  });

  return conflicts;
}

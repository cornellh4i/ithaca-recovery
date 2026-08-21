// Pure helpers shared by update/meeting/route.ts for the three-tier recurring-edit scope
// ('this' / 'thisAndFollowing' / 'all'). Mirrors the ET-day exclusion/trim math delete/meeting/
// route.ts already uses (its own toETDateStr + getETDayBounds) so both routes agree on exactly
// which instant an occurrence's ET calendar day starts at.
import { getETDayBounds } from "../date/timeUtils";
import { matchesRecurrencePattern } from "./recurrenceMatch";

export type EditScope = 'this' | 'thisAndFollowing' | 'all';

export type RecurrencePatternLike = {
  type: string;
  startDate: Date;
  endDate: Date | null;
  interval: number;
  daysOfWeek: string[];
  weekOfMonth: number | null;
  dayOfMonth: number | null;
  excludedDates: Date[];
};

// Returns "YYYY-MM-DD" in Eastern Time for the given UTC timestamp -- same definition delete/
// meeting/route.ts keeps locally; duplicated here (not imported from that route) since routes
// don't export their internals.
export const toETDateStr = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

// The UTC instant of the start of occurrenceDate's ET calendar day -- what gets pushed onto
// RecurrencePattern.excludedDates for scope 'this' (delete route :144-145's exact math).
export const exclusionInstant = (occurrenceDate: Date): Date => {
  const [dayStart] = getETDayBounds(toETDateStr(occurrenceDate));
  return dayStart;
};

// 1ms before the start of occurrenceDate's ET calendar day -- the new RecurrencePattern.endDate
// for scope 'thisAndFollowing', so the trimmed series' last occurrence is the day before
// occurrenceDate (delete route :160-162's exact math).
export const trimmedEndDate = (occurrenceDate: Date): Date => {
  const [dayStart] = getETDayBounds(toETDateStr(occurrenceDate));
  return new Date(dayStart.getTime() - 1);
};

// True when occurrenceDate is an actual live occurrence of `pattern` -- not excluded, not past
// the series end, and on a date/day-of-week/day-of-month the pattern actually produces.
export const isLiveOccurrence = (pattern: RecurrencePatternLike, occurrenceDate: Date): boolean => {
  const etDateStr = toETDateStr(occurrenceDate);
  const [year, month, day] = etDateStr.split('-').map(Number);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  return matchesRecurrencePattern(pattern, etDateStr, localDate);
};

// The root mid a lineage chain shares: a meeting produced by an earlier split already carries
// its own splitFromMid, which must propagate unchanged rather than being overwritten with the
// mid of the meeting that was just split again -- otherwise a second split of an
// already-split-off series would point at the wrong root.
export const rootSplitMid = (parent: { mid: string; splitFromMid: string | null }): string =>
  parent.splitFromMid ?? parent.mid;

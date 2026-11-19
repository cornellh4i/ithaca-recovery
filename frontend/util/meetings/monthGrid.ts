// ET-safe date window for the desktop Month view (GitHub #459). A month grid is always a fixed
// 6-week x 7-day block -- the same height every month, so the grid never jumps between 4, 5 and
// 6 rows as the user steps through months -- starting the Sunday on or before the 1st. The
// leading/trailing adjacent-month cells show real meetings too, so this is also the exact range
// the grid fetches.
//
// Built purely on ET calendar-date strings ("YYYY-MM-DD"), the same way meetingOccurrences.ts
// works: the day-of-week and day arithmetic go through timeUtils' Date.UTC-as-calculator
// helpers, never a local-timezone Date API, so the window is identical under the suite's
// TZ=UTC pinning, on an ET machine, and across DST changes.

import {
    addDaysToETDateString,
    convertETToUTC,
    formatETDateString,
    getETCalendarDateMs,
} from "../date/timeUtils";

export const MONTH_GRID_WEEKS = 6;
export const MONTH_GRID_DAYS = MONTH_GRID_WEEKS * 7;

export interface MonthGridRange {
    // "YYYY-MM" of the month being displayed -- what the grid's enter transition and the
    // navbar heading key off, so picking a different day inside the same month is a no-op.
    monthKey: string;
    // ET date strings of the first (a Sunday) and last (a Saturday) cell, inclusive.
    startDate: string;
    endDate: string;
    // All MONTH_GRID_DAYS ET date strings, in grid order (row-major, Sunday first).
    days: string[];
}

/**
 * The 42-day window a month grid renders for the ET month containing `anchorDate`: six full
 * Sunday-to-Saturday weeks starting the Sunday on or before the 1st. A month whose 1st is a
 * Sunday starts on the 1st itself.
 */
export const getMonthGridRange = (anchorDate: Date): MonthGridRange => {
    const monthKey = formatETDateString(anchorDate).slice(0, 7);
    const firstOfMonth = `${monthKey}-01`;
    // getUTCDay on a Date.UTC calendar timestamp is the proleptic weekday of that calendar
    // date -- no timezone involved (same idiom as timeUtils' getETDayOfWeek).
    const leadingDays = new Date(getETCalendarDateMs(firstOfMonth)).getUTCDay();
    const startDate = addDaysToETDateString(firstOfMonth, -leadingDays);
    const days = Array.from({ length: MONTH_GRID_DAYS }, (_, i) => addDaysToETDateString(startDate, i));
    return { monthKey, startDate, endDate: days[days.length - 1], days };
};

/**
 * The grid a given first cell belongs to -- the inverse of getMonthGridRange(...).startDate.
 * The first cell is at most 6 days before the 1st, so the cell 6 days later is always inside
 * the grid's own month. For a caller that only knows which range it last loaded (MonthView's
 * loaded-data key), not which month was asked for.
 */
export const getMonthGridRangeForStart = (startEtDateStr: string): MonthGridRange =>
    getMonthGridRange(etDateStringToNoonET(addDaysToETDateString(startEtDateStr, 6)));

/** True when the ET date string falls in the grid's own month (not an adjacent-month cell). */
export const isInGridMonth = (etDateStr: string, range: Pick<MonthGridRange, "monthKey">): boolean =>
    etDateStr.slice(0, 7) === range.monthKey;

/**
 * Noon ET on the given ET date string -- the same anchor weekDates.ts uses for every Date it
 * hands back, so re-deriving the ET date string from the result can never roll back a day.
 */
export const etDateStringToNoonET = (etDateStr: string): Date =>
    new Date(convertETToUTC(`${etDateStr}T12:00:00`));

/**
 * Groups range-endpoint results by the ET date each occurrence was expanded onto (the `date`
 * field every /api/retrieve/meeting/range row carries). Input order is preserved within a day.
 */
export const groupMeetingsByETDate = <T extends { date: string }>(meetings: T[]): Map<string, T[]> => {
    const byDate = new Map<string, T[]>();
    for (const meeting of meetings) {
        const bucket = byDate.get(meeting.date);
        if (bucket) {
            bucket.push(meeting);
        } else {
            byDate.set(meeting.date, [meeting]);
        }
    }
    return byDate;
};

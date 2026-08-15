// ET-safe week-boundary math, extracted out of WeekView.tsx so WeekStrip (and anything
// else that needs "what week is this date in") shares the same logic instead of a second,
// possibly-drifting reimplementation of this DST-sensitive date math. Every helper here
// builds on timeUtils.ts's canonical ET-date-string primitives (getETDayOfWeek,
// addDaysToETDateString, getETCalendarDateMs) rather than each re-deriving the underlying
// Date.UTC(...) proleptic-calendar idiom itself.

import { formatETDateString, convertETToUTC, addDaysToETDateString, getETDayOfWeek, getETCalendarDateMs } from "./timeUtils";

// Anchors an ET calendar-date string to noon ET -- shared by every helper below that returns
// a Date, so re-deriving an ET date string from the result later can't roll back a day.
const toNoonET = (etDateStr: string): Date => new Date(convertETToUTC(`${etDateStr}T12:00:00`));

// Get the first day (Sunday) of the ET week containing the provided date. Computed from ET
// calendar-date integers, not Date.prototype.getDay()/getDate() -- those interpret in the
// runtime's local timezone, which is correct on a machine set to America/New_York but silently
// picks the wrong week in CI, where the runtime defaults to UTC: near ET's midnight boundary,
// a UTC-local getDay() disagrees with the real ET calendar day by one.
export const getFirstDayOfWeek = (date: Date): Date => {
    const etDateStr = formatETDateString(date);
    return toNoonET(addDaysToETDateString(etDateStr, -getETDayOfWeek(date)));
};

// Generate an array of dates for the entire week, same ET-safe construction as above.
export const getDaysOfWeek = (startDate: Date): Date[] => {
    const etDateStr = formatETDateString(startDate);
    return Array.from({ length: 7 }, (_, i) => toNoonET(addDaysToETDateString(etDateStr, i)));
};

// Shifts `date` by `days` ET calendar days (negative to go back), same noon-ET-anchored
// construction as the two helpers above.
export const addDaysToDate = (date: Date, days: number): Date =>
    toNoonET(addDaysToETDateString(formatETDateString(date), days));

// Whole ET calendar days from `a` to `b` (negative if `b` is earlier) -- for a caller
// (MultiDayLandscapeView) that needs to know how far a date has drifted from some anchor in
// day-granularity terms, not just which week it's in.
export const daysBetweenET = (a: Date, b: Date): number => {
    const aMs = getETCalendarDateMs(formatETDateString(a));
    const bMs = getETCalendarDateMs(formatETDateString(b));
    return Math.round((bMs - aMs) / (24 * 60 * 60 * 1000));
};

// Re-anchors a Date to noon ET on the *same calendar day the runtime's local timezone sees
// it as* -- for normalizing a Date built by something outside this codebase's own ET-safe
// helpers (e.g. react-day-picker's onSelect, which hands back a local-midnight-anchored
// Date for whichever cell the user clicked).
// INVARIANT: deliberately uses local getFullYear/getMonth/getDate (not formatETDateString) to
// read the intended calendar day -- on a runtime whose local timezone isn't ET, converting the
// raw local-midnight Date through ET first can land on the *previous* ET calendar day (e.g.
// July 15 00:00 UTC is July 14, 8pm ET), silently selecting the wrong day. See DatePicker.tsx's
// stringToDate and MiniCalendar.tsx's own INVARIANT comments for the same reasoning applied to
// their react-day-picker call sites.
export const toNoonETOnLocalCalendarDay = (date: Date): Date => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const localEtDateStr = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    return toNoonET(localEtDateStr);
};

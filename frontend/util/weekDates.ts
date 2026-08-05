// ET-safe week-boundary math, extracted out of WeekView.tsx so WeekStrip (and anything
// else that needs "what week is this date in") shares the same logic instead of a second,
// possibly-drifting reimplementation of this DST-sensitive date math.

import { formatETDateString, convertETToUTC } from "./timeUtils";

// Get the first day (Sunday) of the ET week containing the provided date. Computed from ET
// calendar-date integers, not Date.prototype.getDay()/getDate() -- those interpret in the
// runtime's local timezone, which is correct on a machine set to America/New_York but silently
// picks the wrong week in CI, where the runtime defaults to UTC: near ET's midnight boundary,
// a UTC-local getDay() disagrees with the real ET calendar day by one. Returned as noon ET
// (not midnight) so re-deriving an ET date string from it later can't roll back a day.
export const getFirstDayOfWeek = (date: Date): Date => {
    const etDateStr = formatETDateString(date);
    const [year, month, day] = etDateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const sundayEtDateStr = new Date(Date.UTC(year, month - 1, day - dow)).toISOString().slice(0, 10);
    return new Date(convertETToUTC(`${sundayEtDateStr}T12:00:00`));
};

// Generate an array of dates for the entire week, same ET-safe construction as above.
export const getDaysOfWeek = (startDate: Date): Date[] => {
    const etDateStr = formatETDateString(startDate);
    const [year, month, day] = etDateStr.split('-').map(Number);
    return Array.from({ length: 7 }, (_, i) => {
        const dayEtDateStr = new Date(Date.UTC(year, month - 1, day + i)).toISOString().slice(0, 10);
        return new Date(convertETToUTC(`${dayEtDateStr}T12:00:00`));
    });
};

// Shifts `date` by `days` ET calendar days (negative to go back), same noon-ET-anchored
// construction as the two helpers above.
export const addDaysToDate = (date: Date, days: number): Date => {
    const etDateStr = formatETDateString(date);
    const [year, month, day] = etDateStr.split('-').map(Number);
    const shiftedEtDateStr = new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
    return new Date(convertETToUTC(`${shiftedEtDateStr}T12:00:00`));
};

// Re-anchors a Date to noon ET on the *same calendar day the runtime's local timezone sees
// it as* -- for normalizing a Date built by something outside this codebase's own ET-safe
// helpers (e.g. react-day-picker's onSelect, which hands back a local-midnight-anchored
// Date for whichever cell the user clicked). Deliberately uses local getFullYear/getMonth/
// getDate (not formatETDateString) to read the intended calendar day: on a runtime whose
// local timezone isn't ET, converting the raw local-midnight Date through ET first can land
// on the *previous* ET calendar day (e.g. July 15 00:00 UTC is July 14, 8pm ET), silently
// selecting the wrong day.
export const toNoonETOnLocalCalendarDay = (date: Date): Date => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const localEtDateStr = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    return new Date(convertETToUTC(`${localEtDateStr}T12:00:00`));
};

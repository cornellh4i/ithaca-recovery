// Pure, DB-free recurrence-matching predicates -- deliberately has no `server-only` or Prisma
// import (unlike meetingOccurrences.ts, which re-exports these) so client components can use
// the exact same matching logic the server uses instead of maintaining a second, drifting copy.
// See ViewMeeting.tsx's use of matchesRecurrencePattern for why that matters: two independent
// implementations previously disagreed on monthly patterns, excludedDates, and weekly interval
// anchoring.
import { convertETToUTC, WEEKDAY_NAMES } from "../date/timeUtils";

const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
});

// Returns true if the given ET date string appears in the excludedDates list.
const isDateExcluded = (excludedDates: Date[], dateStr: string): boolean =>
    excludedDates.some(excl => etFmt.format(new Date(excl)) === dateStr);

// Returns true if the given ET date string falls inside one of a meeting's suspension windows.
// `dateStr` must be the date actually being evaluated (the calendar date being rendered, or
// today's ET date for "is this meeting suspended right now" contexts) -- never implicitly "now",
// so a past-date calendar view correctly reflects what was true on that date, not live status.
export const isDateSuspended = (
    suspensions: { from: Date; to: Date | null }[],
    dateStr: string,
): boolean =>
    suspensions.some(s => {
        const fromStr = etFmt.format(new Date(s.from));
        const toStr = s.to ? etFmt.format(new Date(s.to)) : null;
        return dateStr >= fromStr && (toStr === null || dateStr < toStr);
    });

// Returns true if the given ET date string is past the series end date.
// Compares ET date strings to avoid UTC-midnight vs ET-midnight mismatches.
export const isAfterSeriesEnd = (endDate: Date | null, dateStr: string): boolean => {
    if (!endDate) return false;
    return dateStr > etFmt.format(new Date(endDate));
};

// Returns true if a recurrence pattern produces an occurrence on the given ET calendar date.
export const matchesRecurrencePattern = (
    recurrence: { type: string; startDate: Date; endDate: Date | null; interval: number; daysOfWeek: string[]; weekOfMonth: number | null; dayOfMonth: number | null; excludedDates: Date[] },
    etDateStr: string,
    localDate: Date,
): boolean => {
    const patternStartDate = new Date(recurrence.startDate);

    // Compare in ET (not UTC) to avoid late-night ET meetings whose UTC timestamp
    // falls on the next calendar day causing the boundary check to fail.
    if (etDateStr < etFmt.format(patternStartDate)) return false;
    if (isAfterSeriesEnd(recurrence.endDate ?? null, etDateStr)) return false;
    if (recurrence.excludedDates?.length && isDateExcluded(recurrence.excludedDates, etDateStr)) return false;

    // Same ET-anchored construction as localDate below -- patternStartDate is a raw instant,
    // and its getUTCDay()/getUTCMonth()/getUTCFullYear() can disagree with its true ET calendar
    // date near midnight (e.g. 11 PM ET is already the next UTC day), shifting every
    // week/month-alignment calculation below by a day.
    const startEtDateStr = etFmt.format(patternStartDate);
    const [startEtYear, startEtMonth, startEtDay] = startEtDateStr.split('-').map(Number);
    const patternStartLocalDate = new Date(Date.UTC(startEtYear, startEtMonth - 1, startEtDay));

    const dayOfWeek = localDate.getUTCDay();
    const requestedDayName = WEEKDAY_NAMES[dayOfWeek];

    if (recurrence.type === "monthly") {
        const interval = recurrence.interval ?? 1;
        const startYear = patternStartLocalDate.getUTCFullYear();
        const startMonth = patternStartLocalDate.getUTCMonth();
        const reqYear = localDate.getUTCFullYear();
        const reqMonth = localDate.getUTCMonth();
        const monthsElapsed = (reqYear - startYear) * 12 + (reqMonth - startMonth);
        if (monthsElapsed % interval !== 0) return false;

        if (recurrence.dayOfMonth != null) {
            return localDate.getUTCDate() === recurrence.dayOfMonth;
        }

        if (recurrence.weekOfMonth != null) {
            if (!(recurrence.daysOfWeek ?? []).includes(requestedDayName)) return false;
            const daysInMonth = new Date(Date.UTC(reqYear, reqMonth + 1, 0)).getUTCDate();
            const dateNum = localDate.getUTCDate();
            if (recurrence.weekOfMonth === -1) {
                return dateNum + 7 > daysInMonth;
            }
            return Math.ceil(dateNum / 7) === recurrence.weekOfMonth;
        }

        return false;
    }

    if (recurrence.type === "weekly") {
        if (!recurrence.daysOfWeek?.includes(requestedDayName)) return false;

        // Get the day of week of the pattern start date (0-6)
        const startDayOfWeek = patternStartLocalDate.getUTCDay();

        // Calculate the start of the week containing the pattern start date
        const patternStartWeekStart = new Date(patternStartLocalDate);
        patternStartWeekStart.setUTCDate(patternStartLocalDate.getUTCDate() - startDayOfWeek);
        patternStartWeekStart.setUTCHours(0, 0, 0, 0);

        // Calculate the start of the week containing the requested date
        const requestedDateWeekStart = new Date(localDate);
        requestedDateWeekStart.setUTCDate(localDate.getUTCDate() - dayOfWeek);
        requestedDateWeekStart.setUTCHours(0, 0, 0, 0);

        // Calculate complete weeks between the start week and the requested week
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksBetween = Math.round(
            (requestedDateWeekStart.getTime() - patternStartWeekStart.getTime()) / msPerWeek
        );

        return weeksBetween % recurrence.interval === 0;
    }

    return false;
};

// Walks forward day-by-day from `fromEtDateStr` (inclusive) and returns the first ET date
// string on/after it that the recurrence pattern actually produces an occurrence on. Bounded to
// ~370 days so a pattern that (mis)matches nothing near `fromEtDateStr` can't loop forever.
export const firstOccurrenceOnOrAfter = (
    recurrence: { type: string; startDate: Date; endDate: Date | null; interval: number; daysOfWeek: string[]; weekOfMonth: number | null; dayOfMonth: number | null; excludedDates: Date[] },
    fromEtDateStr: string,
): string | null => {
    const [year, month, day] = fromEtDateStr.split('-').map(Number);
    let cursor = Date.UTC(year, month - 1, day);
    const msPerDay = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 370; i++) {
        const localDate = new Date(cursor);
        const etDateStr = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, '0')}-${String(localDate.getUTCDate()).padStart(2, '0')}`;
        if (isAfterSeriesEnd(recurrence.endDate, etDateStr)) return null;
        if (matchesRecurrencePattern(recurrence, etDateStr, localDate)) return etDateStr;
        cursor += msPerDay;
    }
    return null;
};

// Adds one calendar day to an ET date string ("YYYY-MM-DD"), via UTC-anchored date-component
// arithmetic (not a real elapsed-time addition), so this can't be thrown off by DST.
export const addOneETDay = (etDateStr: string): string => {
    const [year, month, day] = etDateStr.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

// Shifts a recurring meeting's start/end times (kept as ET wall-clock time) onto a different
// ET calendar date. Shared by getMeetingsForDate and util/resourceOverlap.ts's occurrence
// expansion so this adjustment is only implemented once.
export const adjustOccurrenceToDate = (
    meeting: { startDateTime: Date; endDateTime: Date },
    etDateStr: string,
): { start: Date; end: Date } => {
    const originalStart = new Date(meeting.startDateTime);
    const originalEnd = new Date(meeting.endDateTime);

    const startETTime = etTimeFmt.format(originalStart); // "HH:MM"
    const endETTime = etTimeFmt.format(originalEnd);

    const start = new Date(convertETToUTC(`${etDateStr}T${startETTime}`));

    // An overnight meeting (e.g. 23:30 -> 00:30) has an end time earlier in the day than its
    // start time -- anchoring both to the same etDateStr would otherwise produce end <= start,
    // silently breaking every consumer that assumes a positive-duration occurrence
    // (getMeetingsForDate's rendering, resourceOverlap.ts's overlap sweep).
    const endDateStr = endETTime <= startETTime ? addOneETDay(etDateStr) : etDateStr;
    const end = new Date(convertETToUTC(`${endDateStr}T${endETTime}`));

    return { start, end };
};

import "server-only";
import { getETDayBounds, convertETToUTC, addDaysToETDateString } from "../date/timeUtils";
import { prisma } from "../../lib/prisma";
import { PublicMeeting, toPublicMeeting } from "./publicMeeting";

const notDeleted = { deletedAt: null };

const daysOfWeekNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
const isAfterSeriesEnd = (endDate: Date | null, dateStr: string): boolean => {
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
    const requestedDayName = daysOfWeekNames[dayOfWeek];

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

/**
 * Returns every meeting occurrence (one-time + recurring, expanded) that falls within
 * [startEtDateStr, endEtDateStr] (inclusive), one entry per (meeting, date) pair, tagged with
 * the ET date it was expanded onto. Both underlying queries run exactly once for the whole
 * range -- not once per day -- so a multi-day fetch doesn't repeat the same table scan for
 * every day it covers. Shared by the day, week, and range retrieval routes so recurrence rules
 * are only implemented once.
 */
export const getMeetingsForRange = async (
    startEtDateStr: string,
    endEtDateStr: string,
): Promise<(PublicMeeting & { date: string })[]> => {
    const [startOfRange] = getETDayBounds(startEtDateStr);
    const [, endOfRange] = getETDayBounds(endEtDateStr);

    const directlyScheduledMeetings = await prisma.meeting.findMany({
        where: {
            AND: [notDeleted, { startDateTime: { lte: endOfRange }, endDateTime: { gte: startOfRange } }]
        },
        include: {
            recurrencePattern: true,
            suspensions: true
        }
    });

    // Every recurring meeting whose pattern could produce an occurrence anywhere in the range --
    // unlike the single-day version this replaces, this can't exclude "the occurrence already
    // covered by directlyScheduledMeetings" at the query level: that exclusion has to be
    // per-day (a meeting's own stored row only ever lands on one specific day, not the whole
    // range), so it's applied inside the loop below instead. Bounded by the recurrence's own
    // span overlapping the range: a series that starts after endOfRange or ended before
    // startOfRange can't produce an occurrence anywhere in this window no matter what its
    // weekly/monthly pattern is, so there's no reason to pull it into app memory just to check.
    const allRecurringMeetings = await prisma.meeting.findMany({
        where: {
            AND: [
                notDeleted,
                { isRecurring: true },
                {
                    recurrencePattern: {
                        is: {
                            startDate: { lte: endOfRange },
                            OR: [
                                { endDate: null },
                                { endDate: { gte: startOfRange } },
                            ]
                        }
                    }
                }
            ]
        },
        include: { recurrencePattern: true, suspensions: true }
    });

    const results: (PublicMeeting & { date: string })[] = [];
    // Starts one ET day before the range: a recurring occurrence whose pattern anchors it on
    // that lead-in day can still roll past midnight into startEtDateStr (adjustOccurrenceToDate
    // rolls an overnight end onto the next ET day), and that's the only pass that can produce
    // it -- allRecurringMeetings is otherwise only pattern-matched against days from
    // startEtDateStr onward. Nothing anchored ON the lead-in day itself is kept; it's evaluated
    // only to catch a spillover into the real range.
    let etDateStr = addDaysToETDateString(startEtDateStr, -1);
    while (etDateStr <= endEtDateStr) {
        const [startOfDay, endOfDay] = getETDayBounds(etDateStr);
        const isLeadInDay = etDateStr < startEtDateStr;

        // localDate is used only for day-of-week and recurring-pattern comparisons;
        // represent the ET calendar date as UTC midnight so getUTCDay() is correct.
        const [etYear, etMonth, etDay] = etDateStr.split('-').map(Number);
        const localDate = new Date(Date.UTC(etYear, etMonth - 1, etDay));

        // directlyScheduledMeetings is already fetched range-wide (its own query overlaps
        // [startOfRange, endOfRange], not per day), so a lead-in-day pass adds nothing new here
        // -- an anchor row spilling into startEtDateStr is already covered on the real
        // startEtDateStr iteration below via the same per-day overlap check.
        if (!isLeadInDay) {
            for (const meeting of directlyScheduledMeetings) {
                // A meeting overlapping the whole fetched range doesn't necessarily overlap this
                // specific day within it -- re-check per day against the range-wide result set.
                if (meeting.startDateTime > endOfDay || meeting.endDateTime < startOfDay) continue;
                if (isDateSuspended(meeting.suspensions, etDateStr)) continue;

                if (meeting.isRecurring) {
                    const recurrence = meeting.recurrencePattern;
                    if (isAfterSeriesEnd(recurrence?.endDate ?? null, etDateStr)) continue;
                    if (recurrence?.excludedDates?.length && isDateExcluded(recurrence.excludedDates, etDateStr)) continue;
                }

                results.push({
                    ...toPublicMeeting({ ...meeting, recurrencePattern: meeting.recurrencePattern ?? null }),
                    date: etDateStr,
                });
            }
        }

        for (const meeting of allRecurringMeetings) {
            // Already added above via directlyScheduledMeetings for this specific day -- must
            // exclude by the same overlap condition as that loop (not just "starts on this
            // day"), or an overnight occurrence (whose anchor overlaps today without starting
            // on it) slips through and gets counted twice.
            if (meeting.startDateTime <= endOfDay && meeting.endDateTime >= startOfDay) continue;
            if (isDateSuspended(meeting.suspensions, etDateStr)) continue;
            const recurrence = meeting.recurrencePattern;
            if (!recurrence) continue;
            if (!matchesRecurrencePattern(recurrence, etDateStr, localDate)) continue;

            const { start, end } = adjustOccurrenceToDate(meeting, etDateStr);
            // Only relevant on the lead-in day if it actually spills into the requested range --
            // otherwise this occurrence belongs entirely to the lead-in day, which is outside
            // what the caller asked for.
            if (isLeadInDay && end <= startOfRange) continue;

            results.push({
                ...toPublicMeeting({
                    ...meeting,
                    recurrencePattern: recurrence,
                    startDateTime: start,
                    endDateTime: end,
                }),
                date: isLeadInDay ? startEtDateStr : etDateStr,
            });
        }

        etDateStr = addDaysToETDateString(etDateStr, 1);
    }

    return results;
};

// Single-day convenience wrapper over getMeetingsForRange, kept for the day route and any
// other single-date caller -- strips the `date` tag since it's redundant when every result is
// already known to be on the one requested day.
export const getMeetingsForDate = async (etDateStr: string): Promise<PublicMeeting[]> => {
    const results = await getMeetingsForRange(etDateStr, etDateStr);
    return results.map(({ date: _date, ...meeting }) => meeting);
};

// Resolves a count-bounded series' (numberOfOccurrences set, no explicit endDate) real last
// occurrence -- shared by write/meeting and update/meeting so a series' finite endpoint is
// computed the same way whether it's being persisted or checked for room/zoomRoom conflicts.
// Conflict checks in particular need this: expanding a candidate against a still-null endDate
// treats it as unbounded out to OVERLAP_HORIZON_YEARS, which can produce a false conflict
// against a booking that falls after the series' real end.
export function calculateEndDateFromOccurrences(
    startDate: Date,
    daysOfWeek: string[],
    numberOfOccurrences: number,
    interval: number,
    type: string,
    weekOfMonth: number | null = null,
    dayOfMonth: number | null = null,
): Date {
    const patternStartDate = new Date(startDate);

    if (numberOfOccurrences <= 0) return patternStartDate;

    const dayNameToIndex: Record<string, number> = {
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
        "Thursday": 4, "Friday": 5, "Saturday": 6,
    };

    if (type === "monthly") {
        // The Nth occurrence is (N-1) intervals after the start month
        const rawMonth = patternStartDate.getUTCMonth() + (numberOfOccurrences - 1) * interval;
        const targetYear = patternStartDate.getUTCFullYear() + Math.floor(rawMonth / 12);
        const targetMonth = rawMonth % 12;

        // 23:59:59 ET so the end date is inclusive of its full day
        // even against a naive instant comparison (e.g. `meetingStart <= endDate`).
        const toETDate = (day: number) => new Date(convertETToUTC(
            `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59`
        ));

        if (dayOfMonth != null) {
            return toETDate(dayOfMonth);
        }

        if (weekOfMonth != null && daysOfWeek.length > 0) {
            const targetDay = dayNameToIndex[daysOfWeek[0]];
            const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

            if (weekOfMonth === -1) {
                for (let d = daysInMonth; d >= 1; d--) {
                    if (new Date(Date.UTC(targetYear, targetMonth, d)).getUTCDay() === targetDay) {
                        return toETDate(d);
                    }
                }
            } else {
                let count = 0;
                for (let d = 1; d <= daysInMonth; d++) {
                    if (new Date(Date.UTC(targetYear, targetMonth, d)).getUTCDay() === targetDay) {
                        if (++count === weekOfMonth) {
                            return toETDate(d);
                        }
                    }
                }
            }
        }

        return toETDate(patternStartDate.getUTCDate());
    }

    // Weekly
    if (daysOfWeek.length === 0) return patternStartDate;

    const recurrenceDays = daysOfWeek
        .map(day => dayNameToIndex[day])
        .filter(index => index !== undefined)
        .sort((a, b) => a - b);

    if (recurrenceDays.length === 0) return patternStartDate;

    const endDate = new Date(patternStartDate);
    let occurrenceCount = 0;
    let currentWeek = 0;
    const startDayOfWeek = patternStartDate.getUTCDay();

    // The start date only counts as an occurrence if its weekday is in daysOfWeek.
    if (recurrenceDays.includes(startDayOfWeek)) {
        occurrenceCount++;
        if (occurrenceCount >= numberOfOccurrences) return patternStartDate;
    }

    let nextDayIndex = recurrenceDays.findIndex(day => day > startDayOfWeek);
    if (nextDayIndex === -1) { nextDayIndex = 0; currentWeek++; }

    while (occurrenceCount < numberOfOccurrences) {
        if (currentWeek % interval === 0) {
            while (nextDayIndex < recurrenceDays.length) {
                const daysToAdd = (currentWeek * 7) +
                    (recurrenceDays[nextDayIndex] - startDayOfWeek + 7) % 7;
                endDate.setUTCDate(patternStartDate.getUTCDate() + daysToAdd);
                occurrenceCount++;
                nextDayIndex++;
                if (occurrenceCount >= numberOfOccurrences) return endDate;
            }
        }
        currentWeek++;
        nextDayIndex = 0;
    }

    return endDate;
}

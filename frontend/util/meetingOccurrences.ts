import { getETDayBounds, convertETToUTC } from "./timeUtils";
import { prisma } from "../lib/prisma";
import { PublicMeeting, toPublicMeeting } from "./publicMeeting";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const daysOfWeekNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
});

// Returns true if the given ET date string appears in the excludedDates list.
const isDateExcluded = (excludedDates: Date[], dateStr: string): boolean =>
    excludedDates.some(excl => etFmt.format(new Date(excl)) === dateStr);

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
const addOneETDay = (etDateStr: string): string => {
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

/**
 * Returns every meeting occurrence (one-time + recurring, expanded) that falls on the given
 * ET calendar date, with recurring occurrences' start/end times adjusted onto that date.
 * Shared by the day and week retrieval routes so recurrence rules are only implemented once.
 */
export const getMeetingsForDate = async (etDateStr: string): Promise<PublicMeeting[]> => {
    const [startOfDay, endOfDay] = getETDayBounds(etDateStr);

    // localDate is used only for day-of-week and recurring-pattern comparisons;
    // represent the ET calendar date as UTC midnight so getUTCDay() is correct.
    const [etYear, etMonth, etDay] = etDateStr.split('-').map(Number);
    const localDate = new Date(Date.UTC(etYear, etMonth - 1, etDay));

    const directlyScheduledMeetings = await prisma.meeting.findMany({
        where: {
            AND: [notDeleted, { startDateTime: { lte: endOfDay }, endDateTime: { gte: startOfDay } }]
        },
        include: {
            recurrencePattern: true
        }
    });

    const regularMeetings = directlyScheduledMeetings.filter(meeting => !meeting.isRecurring);
    const originalDayRecurringMeetings = directlyScheduledMeetings.filter(meeting => {
        if (!meeting.isRecurring) return false;
        const recurrence = meeting.recurrencePattern;
        if (isAfterSeriesEnd(recurrence?.endDate ?? null, etDateStr)) return false;
        if (recurrence?.excludedDates?.length && isDateExcluded(recurrence.excludedDates, etDateStr)) return false;
        return true;
    });

    // "Other" occurrences of a recurring series — i.e. every occurrence except the one
    // already covered by directlyScheduledMeetings above. Must exclude by the same overlap
    // condition as that query (not just "fully contained in today"), or an overnight
    // occurrence (whose anchor overlaps today without being contained in it) slips through
    // and gets counted twice: once via originalDayRecurringMeetings, once again here.
    const otherRecurringMeetings = await prisma.meeting.findMany({
        where: {
            AND: [
                notDeleted,
                { isRecurring: true },
                { NOT: { AND: [{ startDateTime: { lte: endOfDay } }, { endDateTime: { gte: startOfDay } }] } }
            ]
        },
        include: { recurrencePattern: true }
    });

    const patternDayMeetings = otherRecurringMeetings.filter(meeting => {
        const recurrence = meeting.recurrencePattern;
        if (!recurrence) return false;
        return matchesRecurrencePattern(recurrence, etDateStr, localDate);
    });

    const adjustedPatternMeetings = patternDayMeetings.map(meeting => {
        const { start, end } = adjustOccurrenceToDate(meeting, etDateStr);

        return {
            ...meeting,
            startDateTime: start,
            endDateTime: end,
        };
    });

    const allMeetings = [
        ...regularMeetings,
        ...originalDayRecurringMeetings,
        ...adjustedPatternMeetings
    ];

    return allMeetings.map((meeting) => toPublicMeeting({
        ...meeting,
        recurrencePattern: meeting.recurrencePattern ?? null,
    }));
};

export const dynamic = 'force-dynamic';

import { PrismaClient } from '@prisma/client';
import { IMeeting } from "../../../../../util/models";
import { getETDayBounds, convertETToUTC } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();

        // Normalise to a "YYYY-MM-DD" ET calendar date string
        const etDateStr = dateParam.match(/^\d{4}-\d{2}-\d{2}$/)
            ? dateParam
            : new Date(dateParam).toISOString().slice(0, 10);

        const [startOfDay, endOfDay] = getETDayBounds(etDateStr);

        // localDate is used only for day-of-week and recurring-pattern comparisons;
        // represent the ET calendar date as UTC midnight so getUTCDay() is correct.
        const [etYear, etMonth, etDay] = etDateStr.split('-').map(Number);
        const localDate = new Date(Date.UTC(etYear, etMonth - 1, etDay));

        const dayOfWeek = localDate.getUTCDay();
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const requestedDayName = daysOfWeek[dayOfWeek];
        
        const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

        // Returns true if the given ET date string appears in the excludedDates list.
        const isDateExcluded = (excludedDates: Date[], etDateStr: string): boolean =>
            excludedDates.some(excl => etFmt.format(excl) === etDateStr);

        // Returns true if the given ET date string is past the series end date.
        // Compares ET date strings to avoid UTC-midnight vs ET-midnight mismatches.
        const isAfterSeriesEnd = (endDate: Date | null, etDateStr: string): boolean => {
            if (!endDate) return false;
            return etDateStr > etFmt.format(endDate);
        };

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

        const otherRecurringMeetings = await prisma.meeting.findMany({
            where: {
                AND: [
                    notDeleted,
                    { isRecurring: true },
                    { NOT: { AND: [{ startDateTime: { gte: startOfDay } }, { endDateTime: { lte: endOfDay } }] } }
                ]
            },
            include: { recurrencePattern: true }
        });

        const patternDayMeetings = otherRecurringMeetings.filter(meeting => {
            const recurrence = meeting.recurrencePattern;
            if (!recurrence) return false;

            const patternStartDate = new Date(recurrence.startDate);
            // Compare in ET (not UTC) to avoid late-night ET meetings whose UTC timestamp
            // falls on the next calendar day causing the boundary check to fail.
            if (etDateStr < etFmt.format(patternStartDate)) return false;

            if (isAfterSeriesEnd(recurrence.endDate ?? null, etDateStr)) return false;

            if (recurrence.excludedDates?.length && isDateExcluded(recurrence.excludedDates, etDateStr)) return false;

            if (recurrence.type === "monthly") {
                const interval = recurrence.interval ?? 1;
                const startYear = patternStartDate.getUTCFullYear();
                const startMonth = patternStartDate.getUTCMonth();
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
                    if (recurrence.weekOfMonth === -1) { // Checking last occurence of this weekday of the month
                        return dateNum + 7 > daysInMonth;
                    }
                    return Math.ceil(dateNum / 7) === recurrence.weekOfMonth;
                }

                return false;
            }

            if (recurrence.type === "weekly") {
                if (!recurrence.daysOfWeek?.includes(requestedDayName)) return false;

                // Get the day of week of the pattern start date (0-6)
                const startDayOfWeek = patternStartDate.getUTCDay();

                // Calculate the start of the week containing the pattern start date
                const patternStartWeekStart = new Date(patternStartDate);
                patternStartWeekStart.setUTCDate(patternStartDate.getUTCDate() - startDayOfWeek);
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
        });
        
        // Extract ET wall-clock time (HH:MM) so that late-night meetings whose UTC
        // timestamp crosses midnight are placed at the correct ET hour on the target date.
        const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/New_York',
            hour: '2-digit', minute: '2-digit', hour12: false,
        });

        const adjustedPatternMeetings = patternDayMeetings.map(meeting => {
            const originalStart = new Date(meeting.startDateTime);
            const originalEnd = new Date(meeting.endDateTime);

            const startETTime = etTimeFmt.format(originalStart); // "HH:MM"
            const endETTime   = etTimeFmt.format(originalEnd);

            const adjustedStart = new Date(convertETToUTC(`${etDateStr}T${startETTime}`));
            const adjustedEnd   = new Date(convertETToUTC(`${etDateStr}T${endETTime}`));

            return {
                ...meeting,
                startDateTime: adjustedStart,
                endDateTime: adjustedEnd,
            };
        });
        
        const allMeetings = [
            ...regularMeetings, 
            ...originalDayRecurringMeetings,
            ...adjustedPatternMeetings
        ];
        
        const typedMeetings: IMeeting[] = allMeetings.map((meeting) => {
            const { recurrencePattern, ...meetingDetails } = meeting;
          
            return {
              ...meetingDetails,
              recurrencePattern: recurrencePattern ?? null,
            };
          });          
        
        return new Response(JSON.stringify(typedMeetings), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });

    } catch (error) {
        console.error("Error retrieving meetings: ", error);
        return new Response(JSON.stringify({ error: "Error retrieving meetings" }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
};

export { retrieveDayMeetings as GET };
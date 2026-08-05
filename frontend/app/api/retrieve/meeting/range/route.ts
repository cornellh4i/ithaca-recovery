export const dynamic = 'force-dynamic';

import { getMeetingsForDate } from "../../../../../util/meetingOccurrences";
import { toETDateString, addDaysToETDateString } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

// A safety backstop, not a real limit any caller should hit -- MultiDayLandscapeView's pages
// top out at MAX_DAYS (7), so a well-formed request never approaches this.
const MAX_RANGE_DAYS = 31;

const retrieveRangeMeetings = async (request: NextRequest) => {
    try {
        const startParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const endParam = request.nextUrl.searchParams.get("endDate") ?? startParam;
        const startEtDateStr = toETDateString(startParam);
        const endEtDateStr = toETDateString(endParam);

        // Inclusive day list from start to end -- same recurrence-expansion approach as
        // week/route.ts's own loop, just over an arbitrary range instead of a fixed calendar
        // week, so a caller needing e.g. a 4-day page doesn't have to over-fetch whole weeks
        // around it. ET date strings compare lexicographically the same as chronologically
        // (zero-padded "YYYY-MM-DD"), so plain string comparison is enough to bound the loop.
        const dates: string[] = [];
        let cursor = startEtDateStr;
        for (let i = 0; i < MAX_RANGE_DAYS && cursor <= endEtDateStr; i++) {
            dates.push(cursor);
            cursor = addDaysToETDateString(cursor, 1);
        }

        // Sequential, not Promise.all -- same reasoning as week/route.ts's own loop (concurrent
        // per-day queries intermittently returned incomplete results under load).
        const meetingsByDay = [];
        for (const date of dates) {
            const dayMeetings = await getMeetingsForDate(date);
            meetingsByDay.push(dayMeetings.map(meeting => ({ ...meeting, date })));
        }

        return new Response(JSON.stringify(meetingsByDay.flat()), {
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

export { retrieveRangeMeetings as GET };

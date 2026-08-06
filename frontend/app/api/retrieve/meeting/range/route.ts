export const dynamic = 'force-dynamic';

import { getMeetingsForRange } from "../../../../../util/meetingOccurrences";
import { toETDateString, addDaysToETDateString } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

// A safety backstop, not a real limit any caller should hit -- MultiDayLandscapeView's pages
// top out at MAX_DAYS (7), so a well-formed request never approaches this.
const MAX_RANGE_DAYS = 31;

// toETDateString passes a "YYYY-MM-DD"-shaped string through unvalidated (see its own
// comment) -- a value like "2024-02-31" matches the shape but isn't a real calendar date.
// Round-tripping through Date.UTC and comparing the parts back out catches that: an invalid
// day/month rolls over onto a different date, so the parts no longer match what was given.
const isValidCalendarDateString = (dateStr: string): boolean => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const retrieveRangeMeetings = async (request: NextRequest) => {
    try {
        const startParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const endParam = request.nextUrl.searchParams.get("endDate") ?? startParam;

        // toETDateString throws (Intl.DateTimeFormat rejects an unparseable Date) for input
        // that's neither "YYYY-MM-DD"-shaped nor a valid date string at all (e.g. "not-a-date")
        // -- caught here so that's a 400 (bad request), not a 500 from the outer catch below.
        let startEtDateStr: string, endEtDateStr: string;
        try {
            startEtDateStr = toETDateString(startParam);
            endEtDateStr = toETDateString(endParam);
        } catch {
            return new Response(JSON.stringify({ error: "startDate/endDate must be valid dates" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!isValidCalendarDateString(startEtDateStr) || !isValidCalendarDateString(endEtDateStr)) {
            return new Response(JSON.stringify({ error: "startDate/endDate must be valid calendar dates" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        if (endEtDateStr < startEtDateStr) {
            return new Response(JSON.stringify({ error: "endDate must not precede startDate" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Counts inclusive days from start to end without building the list -- ET date strings
        // compare lexicographically the same as chronologically (zero-padded "YYYY-MM-DD"), so
        // plain string comparison is enough to bound the loop.
        let cursor = startEtDateStr;
        for (let i = 0; i < MAX_RANGE_DAYS && cursor <= endEtDateStr; i++) {
            cursor = addDaysToETDateString(cursor, 1);
        }

        // A range wider than MAX_RANGE_DAYS falls out of the loop above with `cursor` still
        // short of endEtDateStr -- reject it explicitly rather than silently returning 200
        // with only the first MAX_RANGE_DAYS days' worth of data.
        if (cursor <= endEtDateStr) {
            return new Response(JSON.stringify({ error: `Range must not exceed ${MAX_RANGE_DAYS} days` }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Single range query instead of one getMeetingsForDate call per day -- previously this
        // re-ran an unbounded recurring-meetings scan once for every day in the range.
        const meetings = await getMeetingsForRange(startEtDateStr, endEtDateStr);

        return new Response(JSON.stringify(meetings), {
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

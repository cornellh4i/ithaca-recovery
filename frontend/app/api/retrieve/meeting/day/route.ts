export const dynamic = 'force-dynamic';

import { getMeetingsForDate } from "../../../../../util/meetings/meetingOccurrences";
import { toETDateString } from "../../../../../util/date/timeUtils";
import { NextRequest } from 'next/server';

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();

        // toETDateString throws for a param that's neither "YYYY-MM-DD"-shaped nor a parseable
        // date string at all, and also for a "YYYY-MM-DD"-shaped string that isn't a real
        // calendar date (e.g. "2024-02-31") -- caught here so that's a 400 (bad request), not a
        // 500 from the outer catch below. Matches range/route.ts's handling of the same param.
        let etDateStr: string;
        try {
            etDateStr = toETDateString(dateParam);
        } catch {
            return new Response(JSON.stringify({ error: "startDate must be a valid calendar date" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const meetings = await getMeetingsForDate(etDateStr);

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

export { retrieveDayMeetings as GET };

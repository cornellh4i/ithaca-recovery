export const dynamic = 'force-dynamic';

import { getMeetingsForRange } from "../../../../../util/meetings/meetingOccurrences";
import { toETDateString, getWeekDatesET } from "../../../../../util/date/timeUtils";
import { NextRequest } from 'next/server';

const retrieveWeekMeetings = async (request: NextRequest) => {
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

        const weekDates = getWeekDatesET(etDateStr);

        // A single range query covering the whole week, tagged with the ET date each occurrence
        // was expanded onto (an overnight meeting overlaps two days, so it's tagged onto both --
        // the client clips/labels each day's card, see WeekView.tsx). Previously this looped
        // getMeetingsForDate per day, re-running its unbounded recurring-meetings scan 7 times
        // over for the same week.
        const meetings = await getMeetingsForRange(weekDates[0], weekDates[weekDates.length - 1]);

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
}

export { retrieveWeekMeetings as GET }

export const dynamic = 'force-dynamic';

import { getMeetingsForRange } from "../../../../../util/meetingOccurrences";
import { toETDateString, getWeekDatesET } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const retrieveWeekMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const etDateStr = toETDateString(dateParam);
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

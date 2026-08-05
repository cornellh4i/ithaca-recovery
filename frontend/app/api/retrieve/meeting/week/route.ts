export const dynamic = 'force-dynamic';

import { getMeetingsForDate } from "../../../../../util/meetingOccurrences";
import { toETDateString, getWeekDatesET } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const retrieveWeekMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const etDateStr = toETDateString(dateParam);
        const weekDates = getWeekDatesET(etDateStr);

        // Expand recurrence per day of the week, tagging each occurrence with the ET date it
        // was expanded onto. An overnight meeting overlaps two days, so it's tagged onto both —
        // the client clips/labels each day's card (see WeekView.tsx), not this route.
        //
        // Sequential, not Promise.all: firing all 7 days' queries concurrently intermittently
        // returned incomplete results under load (observed via CI-only e2e flakiness -- correct
        // when run in isolation, wrong under contention). Each day already does 2 Mongo queries,
        // so 7 in parallel is 14 concurrent queries per request; serializing trades some latency
        // for correctness until the real fix (a single range query instead of N per-day ones) is
        // built.
        const meetingsByDay = [];
        for (const date of weekDates) {
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
}

export { retrieveWeekMeetings as GET }

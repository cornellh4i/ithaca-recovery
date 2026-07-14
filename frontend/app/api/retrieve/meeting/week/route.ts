export const dynamic = 'force-dynamic';

import { getMeetingsForDate } from "../../../../../util/meetingOccurrences";
import { toETDateString, getWeekDatesET } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const retrieveWeekMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const etDateStr = toETDateString(dateParam);
        const weekDates = getWeekDatesET(etDateStr);

        // Expand recurrence per day of the week (same rules the day route uses), tagging
        // each occurrence with the ET calendar date it was expanded onto so the client
        // doesn't have to re-derive it from a UTC timestamp.
        const meetingsByDay = await Promise.all(
            weekDates.map(async (date) => {
                const dayMeetings = await getMeetingsForDate(date);
                return dayMeetings.map(meeting => ({ ...meeting, date }));
            })
        );

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

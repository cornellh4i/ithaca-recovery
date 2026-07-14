export const dynamic = 'force-dynamic';

import { getMeetingsForDate } from "../../../../../util/meetingOccurrences";
import { NextRequest } from 'next/server';

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();

        // Normalise to a "YYYY-MM-DD" ET calendar date string
        const etDateStr = dateParam.match(/^\d{4}-\d{2}-\d{2}$/)
            ? dateParam
            : new Date(dateParam).toISOString().slice(0, 10);

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

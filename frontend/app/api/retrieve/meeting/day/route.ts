export const dynamic = 'force-dynamic';

import { getMeetingsForDate } from "../../../../../util/meetingOccurrences";
import { toETDateString } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const etDateStr = toETDateString(dateParam);

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

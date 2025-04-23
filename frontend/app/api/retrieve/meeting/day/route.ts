export const dynamic = 'force-dynamic';

import { PrismaClient } from '@prisma/client';
import { IMeeting } from "../../../../../util/models";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate");
        const inputDate = dateParam ? new Date(dateParam) : new Date();

        // Set start of the day in EDT (midnight EDT = 4am UTC)
        const startUTC = new Date(Date.UTC(
            inputDate.getUTCFullYear(),
            inputDate.getUTCMonth(),
            inputDate.getUTCDate(),
            4, 0, 0, 0 
        ));

        // End of the day in EDT = 1 day later, minus 1 ms
        const endUTC = new Date(startUTC.getTime() + (24 * 60 * 60 * 1000) - 1);

        const meetings = await prisma.meeting.findMany({
            where: {
                startDateTime: {
                    gte: startUTC,
                },
                endDateTime: {
                    lte: endUTC,
                },
            },
        });

        const typedMeetings: IMeeting[] = meetings.map(meeting => ({ ...meeting }));

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

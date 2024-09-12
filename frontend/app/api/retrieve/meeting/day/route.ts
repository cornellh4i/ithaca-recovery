import { PrismaClient } from '@prisma/client';
import { start } from 'repl';
import { IMeeting } from "../../../../../util/models";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        const date = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const standardDate = new Date(date);
        const startDate = new Date(Date.UTC(standardDate.getUTCFullYear(), standardDate.getUTCMonth(), standardDate.getUTCDate()));
        const endDate = new Date(Date.UTC(standardDate.getUTCFullYear(), standardDate.getUTCMonth(), standardDate.getUTCDate(), 23, 59, 59, 999));
        const meetings = await prisma.meeting.findMany({
            where: {
                startDateTime: {
                    gte: startDate,
                },
                endDateTime: {
                    lte: endDate
                }
            }
        }
        );

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
}

export { retrieveDayMeetings as GET }

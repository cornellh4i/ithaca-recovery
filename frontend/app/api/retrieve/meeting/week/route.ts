export const dynamic = 'force-dynamic';
import { PrismaClient } from '@prisma/client';
import { IMeeting } from "../../../../../util/models";
import { getETDayBounds } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const retrieveWeekMeetings = async (request: NextRequest) => {
    try {
        const date = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        const standardDate = new Date(date);
        const dow = standardDate.getUTCDay();

        // Compute Sunday and Saturday of the week as UTC-midnight calendar dates,
        // then get DST-correct ET day bounds for each.
        const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
        const sundayUTC = new Date(Date.UTC(standardDate.getUTCFullYear(), standardDate.getUTCMonth(), standardDate.getUTCDate() - dow));
        const saturdayUTC = new Date(Date.UTC(standardDate.getUTCFullYear(), standardDate.getUTCMonth(), standardDate.getUTCDate() + (6 - dow)));
        const [startDate] = getETDayBounds(fmtDate(sundayUTC));
        const [, endDate] = getETDayBounds(fmtDate(saturdayUTC));
        const meetings = await prisma.meeting.findMany({
            where: {
                ...notDeleted,
                startDateTime: {
                    gte: startDate,
                },
                endDateTime: {
                    lte: endDate
                }
            }
        }
        );

        const typedMeetings: IMeeting[] = meetings.map(meeting => ({ ...meeting }))
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

export { retrieveWeekMeetings as GET }

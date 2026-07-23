export const dynamic = 'force-dynamic';
import { getETDayBounds, toETDateString } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';
import { prisma } from "../../../../../lib/prisma";
import { toPublicMeeting } from "../../../../../util/publicMeeting";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const retrieveMonthMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        // Anchor to the ET calendar date first — deriving month from raw UTC fields can
        // land on the wrong month near a boundary (July 31 11pm ET is already Aug 1 UTC).
        const etDateStr = toETDateString(dateParam);
        const [year, month] = etDateStr.split('-').map(Number); // month is 1-indexed here

        // First and last day of the month as UTC-midnight calendar dates,
        // then get DST-correct ET day bounds for each.
        const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
        const firstDayUTC = new Date(Date.UTC(year, month - 1, 1));
        const lastDayUTC = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of this month
        const [startDate] = getETDayBounds(fmtDate(firstDayUTC));
        const [, endDate] = getETDayBounds(fmtDate(lastDayUTC));

        const meetings = await prisma.meeting.findMany({
            where: {
                ...notDeleted,
                startDateTime: {
                    gte: startDate,
                },
                endDateTime: {
                    lte: endDate,
                }
            }
        })
        const publicMeetings = meetings.map(toPublicMeeting);
        return new Response(JSON.stringify(publicMeetings), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });

    }
    catch (error) {
        console.error("Error retrieving meetings: ", error);
        return new Response(JSON.stringify({ error: "Error retrieving meetings" }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
}

export { retrieveMonthMeetings as GET }

export const dynamic = 'force-dynamic';
import { PrismaClient } from '@prisma/client';
import { IMeeting } from "../../../../../util/models";
import { getETDayBounds } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const retrieveMonthMeetings = async (request: NextRequest) => {
    try {
        const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
        const dateParam = request.nextUrl.searchParams.get("startDate");

        // Normalise to a "YYYY-MM-DD" ET calendar date string before reading
        // year/month, so the "now" default and non-date-only params resolve
        // to today in ET rather than UTC's (possibly already-next-day) date.
        const etDateStr = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
            ? dateParam
            : etFmt.format(dateParam ? new Date(dateParam) : new Date());
        const [year, etMonth] = etDateStr.split('-').map(Number);
        const month = etMonth - 1; // 0-indexed


        // First and last day of the month as UTC-midnight calendar dates,
        // then get DST-correct ET day bounds for each.
        const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
        const firstDayUTC = new Date(Date.UTC(year, month, 1));
        const lastDayUTC = new Date(Date.UTC(year, month + 1, 0)); // day 0 of next month = last day of this month
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
        const typedMeetings: IMeeting[] = meetings.map(meeting => ({
            ...meeting,
            googleCalendarEventIds: (meeting.googleCalendarEventIds ?? {}) as Record<string, string>,
        }))
        return new Response(JSON.stringify(typedMeetings), {
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

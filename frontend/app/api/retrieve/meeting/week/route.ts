export const dynamic = 'force-dynamic';
import { PrismaClient } from '@prisma/client';
import { IMeeting } from "../../../../../util/models";
import { getETDayBounds } from "../../../../../util/timeUtils";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

const retrieveWeekMeetings = async (request: NextRequest) => {
    try {
        const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
        const dateParam = request.nextUrl.searchParams.get("startDate");

        // Normalise to a "YYYY-MM-DD" ET calendar date string before doing any
        // calendar arithmetic, so the "now" default and non-date-only params
        // resolve to today in ET rather than UTC's (possibly already-next-day) date.
        const etDateStr = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
            ? dateParam
            : etFmt.format(dateParam ? new Date(dateParam) : new Date());
        const [etYear, etMonth, etDay] = etDateStr.split('-').map(Number);

        // standardDate represents the ET calendar date as UTC midnight, purely
        // as a self-consistent scratchpad for day-of-week arithmetic below.
        const standardDate = new Date(Date.UTC(etYear, etMonth - 1, etDay));
        const dow = standardDate.getUTCDay();

        // Compute Sunday and Saturday of the week as UTC-midnight calendar dates,
        // then get DST-correct ET day bounds for each.
        const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
        const sundayUTC = new Date(Date.UTC(etYear, etMonth - 1, etDay - dow));
        const saturdayUTC = new Date(Date.UTC(etYear, etMonth - 1, etDay + (6 - dow)));
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

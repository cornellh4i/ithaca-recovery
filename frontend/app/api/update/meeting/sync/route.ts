import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/authConfig";
import { IMeeting } from "../../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, calendarIdsForMeeting } from "../../../../../services/googleCalendar";

const prisma = new PrismaClient();

const syncMeeting = async (request: Request): Promise<Response> => {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.accessToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { mid } = await request.json();

        const meeting = await prisma.meeting.findUnique({
            where: { mid },
            include: { recurrencePattern: true },
        });

        if (!meeting) {
            return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
        }

        const existingEventIds = (meeting.googleCalendarEventIds ?? {}) as Record<string, string>;

        const meetingForCalendar: IMeeting = {
            ...meeting,
            googleCalendarEventIds: existingEventIds,
            recurrencePattern: meeting.recurrencePattern ?? null,
        };

        const calendarIds = calendarIdsForMeeting(meeting.calType ?? []);
        const updatedEventIds: Record<string, string> = { ...existingEventIds };
        let allSynced = true;

        for (const [cat, calId] of Object.entries(calendarIds)) {
            const existingId = existingEventIds[cat];
            if (existingId) {
                const ok = await updateCalendarEvent(session.accessToken, existingId, meetingForCalendar, calId);
                if (!ok) allSynced = false;
            } else {
                const newId = await createCalendarEvent(session.accessToken, meetingForCalendar, calId);
                if (newId) updatedEventIds[cat] = newId;
                else allSynced = false;
            }
        }

        await prisma.meeting.update({
            where: { mid },
            data: {
                googleCalendarEventIds: updatedEventIds,
                syncStatus: allSynced ? 'synced' : 'error',
            },
        });

        return NextResponse.json({ syncStatus: allSynced ? 'synced' : 'error' });
    } catch (error) {
        console.error("Sync retry error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
};

export { syncMeeting as POST };

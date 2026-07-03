import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/authConfig";
import { IMeeting } from "../../../../../util/models";
import { createCalendarEvent, updateCalendarEvent } from "../../../../../services/googleCalendar";

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

        const meetingForCalendar: IMeeting = {
            ...meeting,
            recurrencePattern: meeting.recurrencePattern ?? null,
        };

        let synced: boolean;
        let newEventId: string | null = null;

        if (meeting.googleCalendarEventId) {
            synced = await updateCalendarEvent(session.accessToken, meeting.googleCalendarEventId, meetingForCalendar);
        } else {
            newEventId = await createCalendarEvent(session.accessToken, meetingForCalendar);
            synced = !!newEventId;
        }

        await prisma.meeting.update({
            where: { mid },
            data: {
                ...(newEventId ? { googleCalendarEventId: newEventId } : {}),
                syncStatus: synced ? 'synced' : 'error',
            },
        });

        return NextResponse.json({ syncStatus: synced ? 'synced' : 'error' });
    } catch (error) {
        console.error("Sync retry error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
};

export { syncMeeting as POST };

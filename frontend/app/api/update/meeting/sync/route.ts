import { PrismaClient, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { IMeeting } from "../../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, calendarIdsForMeeting } from "../../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, zoomRoomCalendarId } from "../../../../../services/zoom";

const prisma = new PrismaClient();

const syncMeeting = async (request: Request): Promise<Response> => {
    try {
        const auth = await requireRole(Role.ADMIN);
        if (auth instanceof Response) return auth;
        if (!auth.accessToken) {
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
                const ok = await updateCalendarEvent(auth.accessToken, existingId, meetingForCalendar, calId);
                if (!ok) allSynced = false;
            } else {
                const newId = await createCalendarEvent(auth.accessToken, meetingForCalendar, calId);
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

        // Zoom sync retry — independent from Google Calendar sync above (own status field).
        let zoomSyncStatus = meeting.zoomSyncStatus;
        if (meeting.zoomRoom) {
            let zid = meeting.zid;
            let zoomLink = meeting.zoomLink;
            let zoomCalendarEventId = meeting.zoomCalendarEventId;
            let zoomSynced = true;

            if (zid) {
                const ok = await updateZoomMeeting(zid, meetingForCalendar);
                if (!ok) zoomSynced = false;
            } else {
                const created = await createZoomMeeting(meetingForCalendar, meeting.zoomRoom);
                if (created) {
                    zid = created.zid;
                    zoomLink = created.zoomLink;
                } else {
                    zoomSynced = false;
                }
            }

            if (auth.accessToken && zoomLink) {
                const calId = zoomRoomCalendarId[meeting.zoomRoom];
                if (calId) {
                    const meetingWithZoomLink = { ...meetingForCalendar, zoomLink };
                    if (zoomCalendarEventId) {
                        const ok = await updateCalendarEvent(auth.accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink);
                        if (!ok) zoomSynced = false;
                    } else {
                        const eventId = await createCalendarEvent(auth.accessToken, meetingWithZoomLink, calId, zoomLink);
                        if (eventId) zoomCalendarEventId = eventId;
                        else zoomSynced = false;
                    }
                }
            }

            zoomSyncStatus = zoomSynced ? 'synced' : 'error';
            await prisma.meeting.update({
                where: { mid },
                data: { zid, zoomLink, zoomCalendarEventId, zoomSyncStatus },
            });
        }

        return NextResponse.json({ syncStatus: allSynced ? 'synced' : 'error', zoomSyncStatus });
    } catch (error) {
        console.error("Sync retry error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
};

export { syncMeeting as POST };

import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { IMeeting } from "../../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, reconcileMeetingCalendars } from "../../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomRoomCalendarId } from "../../../../../services/zoom";
import { findResourceConflicts } from "../../../../../util/resourceOverlap";
import { prisma } from "../../../../../lib/prisma";

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

        if (meeting.status === 'Suspended') {
            return NextResponse.json({ syncStatus: meeting.syncStatus ?? null });
        }

        const existingEventIds = (meeting.googleCalendarEventIds ?? {}) as Record<string, string>;

        const meetingForCalendar: IMeeting = {
            ...meeting,
            googleCalendarEventIds: existingEventIds,
            recurrencePattern: meeting.recurrencePattern ?? null,
        };

        const { updatedEventIds, allSynced } = await reconcileMeetingCalendars(
            auth.accessToken,
            meetingForCalendar,
            existingEventIds,
        );

        await prisma.meeting.update({
            where: { mid },
            data: {
                googleCalendarEventIds: updatedEventIds,
                syncStatus: allSynced ? 'synced' : 'error',
            },
        });

        // Zoom sync retry — independent from Google Calendar sync above (own status field).
        let zoomSyncStatus = meeting.zoomSyncStatus;
        let zoomSyncError: string | null = meeting.zoomSyncError ?? null;
        if (meeting.zoomRoom) {
            let zid = meeting.zid;
            let zoomLink = meeting.zoomLink;
            let zoomPasscode = meeting.zoomPasscode;
            let zoomHost = meeting.zoomHost;
            let zoomCalendarEventId = meeting.zoomCalendarEventId;
            let zoomSynced = true;
            zoomSyncError = null;

            let skipCalendarTimeSync = false;
            if (zid) {
                // Re-check the assigned host is still free for this meeting's current schedule
                // before pushing the retry to Zoom — a previous failure could have been
                // transient, but the schedule may also have shifted into a real host conflict.
                const timeConflicts = zoomHost
                    ? await findResourceConflicts("zoomHost", zoomHost, meetingForCalendar, { excludeMid: mid, includeSuspended: true })
                    : [];
                if (timeConflicts.length > 0) {
                    zoomSynced = false;
                    zoomSyncError = "This time now conflicts with another meeting using the same Zoom host.";
                    skipCalendarTimeSync = true;
                } else {
                    const ok = await updateZoomMeeting(zid, meetingForCalendar);
                    if (!ok) zoomSynced = false;
                }
            } else {
                const host = await resolveZoomHost(meetingForCalendar, { excludeMid: mid });
                if (!host) {
                    zoomSynced = false;
                    zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
                } else {
                    const created = await createZoomMeeting(meetingForCalendar, host);
                    if (created) {
                        zid = created.zid;
                        zoomLink = created.zoomLink;
                        zoomPasscode = created.zoomPasscode;
                        zoomHost = host;
                    } else {
                        zoomSynced = false;
                        zoomSyncError = "Failed to create the Zoom meeting.";
                    }
                }
            }

            if (auth.accessToken && zoomLink && !skipCalendarTimeSync) {
                const calId = zoomRoomCalendarId[meeting.zoomRoom];
                if (calId) {
                    const meetingWithZoomLink = { ...meetingForCalendar, zoomLink };
                    if (zoomCalendarEventId) {
                        const ok = await updateCalendarEvent(auth.accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink);
                        if (!ok) zoomSynced = false;
                    } else {
                        const eventId = await createCalendarEvent(auth.accessToken, meetingWithZoomLink, calId, zoomLink);
                        if (eventId) zoomCalendarEventId = eventId;
                        else {
                            zoomSynced = false;
                            zoomSyncError = zoomSyncError ?? "Zoom meeting created but its calendar event failed to sync.";
                        }
                    }
                }
            }

            zoomSyncStatus = zoomSynced ? 'synced' : 'error';
            zoomSyncError = zoomSynced ? null : zoomSyncError;
            const zoomInvitation = zid ? await getZoomMeetingInvitation(zid) : null;
            await prisma.meeting.update({
                where: { mid },
                data: { zid, zoomLink, zoomPasscode, zoomInvitation, zoomHost, zoomCalendarEventId, zoomSyncStatus, zoomSyncError },
            });
        }

        return NextResponse.json({ syncStatus: allSynced ? 'synced' : 'error', zoomSyncStatus, zoomSyncError });
    } catch (error) {
        console.error("Sync retry error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
};

export { syncMeeting as POST };

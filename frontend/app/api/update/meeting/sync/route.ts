import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { IMeeting } from "../../../../../types/models";
import { createCalendarEvent, updateCalendarEvent, reconcileMeetingCalendars } from "../../../../../services/googleCalendar";
import { createZoomMeeting, getZoomHostCapacities, getZoomMeetingCredentials, updateZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomHostPool, zoomRoomCalendarId } from "../../../../../services/zoom";
import { lockResourceClaims } from "../../../../../util/meetings/resourceLocks";
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
            return NextResponse.json({
                googleSyncStatus: meeting.googleSyncStatus ?? null,
                googleSyncError: meeting.googleSyncError ?? null,
                zoomSyncStatus: meeting.zoomSyncStatus ?? null,
                zoomSyncError: meeting.zoomSyncError ?? null,
            });
        }

        const existingEventIds = (meeting.googleCalendarEventIds ?? {}) as Record<string, string>;

        const meetingForCalendar: IMeeting = {
            ...meeting,
            googleCalendarEventIds: existingEventIds,
            recurrencePattern: meeting.recurrencePattern ?? null,
        };

        const zoomEnabled = meeting.modeType === 'Hybrid' || meeting.modeType === 'Remote';

        // Zoom retry runs FIRST, before the calendar reconcile below -- same reasoning as
        // write/meeting/route.ts and update/meeting/route.ts: the calType calendars need the
        // real zoomLink, and if this retry still can't get a working Zoom meeting, the
        // calendar reconcile is skipped again rather than publishing with a missing link.
        let zoomSyncStatus = meeting.zoomSyncStatus;
        let zoomSyncError: string | null = meeting.zoomSyncError ?? null;
        let zid = meeting.zid;
        let zoomLink = meeting.zoomLink;

        if (zoomEnabled) {
            let zoomPasscode = meeting.zoomPasscode;
            let zoomHost = meeting.zoomHost;
            let zoomCalendarEventId = meeting.zoomCalendarEventId;
            let zoomSynced = true;
            zoomSyncError = null;

            if (zid) {
                // Credentials flow the OPPOSITE way from schedule: Zoom is their source of
                // truth (a portal-side passcode change rewrites join_url with no signal to the
                // app, and our PATCHes never send a password field), so a retry adopts the live
                // values before republishing anything -- this is what resolves passcode/link
                // drift instead of re-publishing stale links. Applies to unmanaged meetings
                // too: their owner rotating a passcode is exactly this case. A failed fetch
                // keeps the stored values -- an unreachable Zoom API is not evidence of drift.
                const liveCredentials = await getZoomMeetingCredentials(zid);
                if (liveCredentials?.joinUrl) {
                    zoomLink = liveCredentials.joinUrl;
                    zoomPasscode = liveCredentials.passcode;
                }
                // Retry re-asserts an already-working Zoom meeting's existing claim -- nothing
                // about this meeting's own details changed, so a conflict introduced later by a
                // *different* meeting must not be able to downgrade it (first-come-first-served:
                // the already-synced meeting keeps its spot; editing this meeting's own details
                // is the "re-enter the queue" case, handled separately by update/meeting/route.ts).
                // The conflict itself still surfaces independently via /api/admin/conflict-mids
                // (Diagnostics), regardless of what happens here.
                // Unmanaged (adopted/external) Zoom meetings are never PATCHed -- retrying the
                // sync only re-runs the calendar half against the stored link.
                const ok = meeting.zoomManaged ? await updateZoomMeeting(zid, meetingForCalendar) : true;
                if (!ok) zoomSynced = false;
            } else if (!meeting.zoomManaged) {
                // An unmanaged meeting with no zid points outside the app's Zoom account by
                // deliberate choice -- a retry must not auto-provision an app-owned meeting
                // under a flag that says the app doesn't own it.
            } else {
                // Reserve a pool host under lock BEFORE ever calling the external Zoom API below
                // -- closes #360's TOCTOU gap: two retries of this same meeting (or a retry
                // racing a fresh write/meeting create) could otherwise both read the same
                // last-free host before either persisted it. The reservation transaction only
                // ever writes `zoomHost` and stays DB-only; the external API call happens
                // afterward, outside the lock -- a Postgres advisory lock can't stay held across
                // a network call the way it can across another DB query (see write/meeting and
                // update/meeting's transactions, which don't make external calls either).
                // Resolved BEFORE the locked transaction, same as write/update -- a Zoom API
                // round trip while pool locks are held would extend lock hold time (cached 12h).
                const hostCapacities = await getZoomHostCapacities();
                const host = await prisma.$transaction(async (tx) => {
                    await lockResourceClaims(tx, zoomHostPool.map((h) => ({ type: "zoomHost" as const, value: h })));
                    const resolved = await resolveZoomHost(meetingForCalendar, tx, { excludeMid: mid, capacities: hostCapacities });
                    if (resolved) {
                        await tx.meeting.update({ where: { mid }, data: { zoomHost: resolved } });
                    }
                    return resolved;
                }, { timeout: 10_000 });

                if (!host) {
                    zoomSynced = false;
                    zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
                } else {
                    // Reserved above regardless of what happens next -- a createZoomMeeting
                    // failure below must not roll back the reservation (the final
                    // prisma.meeting.update further down re-persists this same value either way).
                    zoomHost = host;
                    const created = await createZoomMeeting(meetingForCalendar, host);
                    if (created) {
                        zid = created.zid;
                        zoomLink = created.zoomLink;
                        zoomPasscode = created.zoomPasscode;
                    } else {
                        zoomSynced = false;
                        zoomSyncError = "Failed to create the Zoom meeting.";
                    }
                }
            }

            // Only Hybrid meetings have a zoomRoom -- Remote's dedicated per-room Zoom-Room
            // calendar publish naturally no-ops here; its link is carried by the main
            // calType-calendar reconcile below instead.
            if (auth.accessToken && zoomLink && meeting.zoomRoom) {
                const calId = zoomRoomCalendarId[meeting.zoomRoom];
                if (calId) {
                    const meetingWithZoomLink = { ...meetingForCalendar, zoomLink };
                    if (zoomCalendarEventId) {
                        const { ok, error } = await updateCalendarEvent(auth.accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink);
                        if (!ok) {
                            zoomSynced = false;
                            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting's calendar event failed to update.";
                        }
                    } else {
                        const { id: eventId, error } = await createCalendarEvent(auth.accessToken, meetingWithZoomLink, calId, zoomLink);
                        if (eventId) zoomCalendarEventId = eventId;
                        else {
                            zoomSynced = false;
                            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting created but its calendar event failed to sync.";
                        }
                    }
                }
            }

            zoomSyncStatus = zoomSynced ? 'synced' : 'error';
            zoomSyncError = zoomSynced ? null : zoomSyncError;
            // See the comment in app/api/update/meeting/route.ts's syncUpdatedMeeting: a fetch
            // failure here (collapsed to null) shouldn't overwrite an already-stored invitation.
            const zoomInvitation = zid ? (await getZoomMeetingInvitation(zid)) ?? meeting.zoomInvitation : null;
            await prisma.meeting.update({
                where: { mid },
                data: { zid, zoomLink, zoomPasscode, zoomInvitation, zoomHost, zoomCalendarEventId, zoomSyncStatus, zoomSyncError },
            });
        }

        // True when this meeting needs Zoom but doesn't currently have a healthy Zoom sync --
        // gated on the *resulting* zoomSyncStatus, not on !zid (BUG-023: an ID can persist from
        // a prior success while the current retry just failed) -- the calendar reconcile below
        // is deferred, not run with a stale/missing link.
        const zoomBlocking = zoomEnabled && zoomSyncStatus !== 'synced';
        let googleSyncStatus: string;
        let googleSyncError: string | null = null;

        if (zoomBlocking) {
            googleSyncStatus = 'pending';
            await prisma.meeting.update({ where: { mid }, data: { googleSyncStatus, googleSyncError: null } });
        } else {
            const result = await reconcileMeetingCalendars(
                auth.accessToken,
                { ...meetingForCalendar, zoomLink },
                existingEventIds,
            );

            googleSyncStatus = result.allSynced ? 'synced' : 'error';
            googleSyncError = result.allSynced ? null : result.googleSyncError;
            await prisma.meeting.update({
                where: { mid },
                data: { googleCalendarEventIds: result.updatedEventIds, googleSyncStatus, googleSyncError },
            });
        }

        return NextResponse.json({ googleSyncStatus, googleSyncError, zoomSyncStatus, zoomSyncError });
    } catch (error) {
        console.error("Sync retry error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
};

export { syncMeeting as POST };

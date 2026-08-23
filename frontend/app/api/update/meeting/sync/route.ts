import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { IMeeting } from "../../../../../types/models";
import { createCalendarEvent, updateCalendarEvent, reconcileMeetingCalendars } from "../../../../../services/googleCalendar";
import { createZoomMeeting, getZoomHostCapacities, getZoomMeetingCredentials, updateZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomHostPool, zoomRoomCalendarId } from "../../../../../services/zoom";
import { lockResourceClaims } from "../../../../../util/meetings/resourceLocks";
import { familyMembers, getLinkedFamily, isZoomBearing, linkedFamilyLoader } from "../../../../../util/meetings/linkedSchedules";
import { prisma } from "../../../../../lib/prisma";

// How long a linked-schedule family's just-written host reservation is read as "another retry is
// minting this family's Zoom meeting right now". The mint itself happens outside the transaction
// that writes the reservation (the universal convention: no external call inside a DB
// transaction), so the winner's zid only becomes visible a round trip later -- until then the
// reservation it wrote under the family lock is the only evidence that the family is spoken for.
// Age-bounded rather than "a reservation exists at all" because a reservation whose mint FAILED
// is kept deliberately (#360) and would otherwise wedge the family: retrying is how that state
// recovers. Comfortably longer than a Zoom create round trip, short enough that a crashed request
// self-heals within one admin's patience.
const FAMILY_MINT_CLAIM_MS = 60_000;

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
        // One family lookup for this whole retry, shared by the Zoom write and the calendar
        // writes below -- they name the family the same way, so they must read the same rows.
        const loadFamily = linkedFamilyLoader(prisma, mid);

        if (zoomEnabled) {
            let zoomPasscode = meeting.zoomPasscode;
            let zoomHost = meeting.zoomHost;
            let zoomManaged = meeting.zoomManaged;
            let zoomCalendarEventId = meeting.zoomCalendarEventId;
            let zoomSynced = true;
            let liveCredentialsFetched = false;
            // The Zoom-bearing family members this retry has to hand its freshly-minted Zoom
            // identity to (see the mint branch below). Empty for every other path.
            let fanOutMids: string[] = [];
            // What a failed invitation fetch falls back to. This row's own stored value, except
            // when it adopts a sibling's Zoom meeting -- then the family's invitation is the one
            // it should be carrying.
            let storedInvitation = meeting.zoomInvitation;
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
                    liveCredentialsFetched = true;
                }
                // Retry re-asserts an already-working Zoom meeting's existing claim -- nothing
                // about this meeting's own details changed, so a conflict introduced later by a
                // *different* meeting must not be able to downgrade it (first-come-first-served:
                // the already-synced meeting keeps its spot; editing this meeting's own details
                // is the "re-enter the queue" case, handled separately by update/meeting/route.ts).
                // The conflict itself still surfaces independently via /api/admin/conflict-mids
                // (Diagnostics), regardless of what happens here.
                // Unmanaged (adopted/external) Zoom meetings are never PATCHed -- retrying the
                // sync only re-runs the calendar half against the stored link. The whole
                // linked-schedule family rides along so the PATCH sends the union schedule
                // (#513) and the family's own Zoom name, not this row's narrowed view of either.
                const family = meeting.zoomManaged ? await loadFamily(zid) : [];
                const ok = meeting.zoomManaged
                    ? await updateZoomMeeting(zid, meetingForCalendar, family)
                    : true;
                if (!ok) zoomSynced = false;
            } else if (!meeting.zoomManaged) {
                // An unmanaged meeting with no zid points outside the app's Zoom account by
                // deliberate choice -- a retry must not auto-provision an app-owned meeting
                // under a flag that says the app doesn't own it.
            } else {
                // A linked-schedule family is served by ONE Zoom meeting and holds ONE host slot
                // (util/meetings/linkedSchedules.ts), so what the rest of the family already has
                // decides this retry entirely. Two Zoom-bearing members can be zid-less at the
                // same time (a create whose host pool was exhausted), and retrying each of them
                // in turn would otherwise mint a second Zoom meeting for one meeting.
                const linkedFamily = await getLinkedFamily(prisma, mid);
                let familySiblings = (linkedFamily ? familyMembers(linkedFamily) : [])
                    .filter((row) => row.mid !== mid && isZoomBearing(row));
                let holder = familySiblings.find((row) => row.zid) ?? null;
                // The family's one Zoom booking, named by whichever mid roots the family, so both
                // rows of one family produce the same lock value.
                const anchorMid = meeting.linkedToMid ?? mid;
                let mintHost: string | null = null;
                let mintBlockedError: string | null = null;

                if (!holder) {
                    // Reserve a pool host under lock BEFORE ever calling the external Zoom API
                    // below -- closes #360's TOCTOU gap: two retries of this same meeting (or a
                    // retry racing a fresh write/meeting create) could otherwise both read the
                    // same last-free host before either persisted it. The reservation
                    // transaction only ever writes `zoomHost` and stays DB-only; the external
                    // API call happens afterward, outside the lock -- a Postgres advisory lock
                    // can't stay held across a network call the way it can across another DB
                    // query (see write/meeting and update/meeting's transactions, which don't
                    // make external calls either).
                    // Resolved BEFORE the locked transaction, same as write/update -- a Zoom
                    // API round trip while pool locks are held would extend lock hold time
                    // (cached 12h).
                    const hostCapacities = await getZoomHostCapacities();
                    const reservation = await prisma.$transaction(async (tx) => {
                        // The whole pool plus the FAMILY itself. The pool lock alone can't
                        // serialize two retries on the two rows of one zid-less family: they may
                        // resolve different hosts and so never contend for the same pool claim,
                        // and both would mint. One call with every claim, per lockResourceClaims'
                        // one-call-per-transaction invariant.
                        await lockResourceClaims(tx, [
                            ...zoomHostPool.map((h) => ({ type: "zoomHost" as const, value: h })),
                            { type: "zoomFamily" as const, value: anchorMid },
                        ]);
                        // Re-read the family INSIDE the lock: the read above ran before this
                        // request could contend with anything, so a retry of a sibling row may
                        // have provisioned or claimed the family's Zoom meeting since.
                        const lockedFamily = await getLinkedFamily(tx, mid);
                        const lockedSiblings = (lockedFamily ? familyMembers(lockedFamily) : [])
                            .filter((row) => row.mid !== mid && isZoomBearing(row));
                        const lockedHolder = lockedSiblings.find((row) => row.zid) ?? null;
                        if (lockedHolder) return { siblings: lockedSiblings, holder: lockedHolder, host: null, blocked: false };

                        // A sibling holding a reservation written moments ago is a retry that is
                        // minting the family's meeting right now (see FAMILY_MINT_CLAIM_MS):
                        // minting here too would leave one meeting with two Zoom meetings, one of
                        // them orphaned. Nothing to adopt yet either -- that retry's zid doesn't
                        // exist, so this one defers instead.
                        const minting = lockedSiblings.some((row) => (
                            !row.zid && row.zoomHost && row.updatedAt
                            && Date.now() - row.updatedAt.getTime() < FAMILY_MINT_CLAIM_MS
                        ));
                        if (minting) return { siblings: lockedSiblings, holder: null, host: null, blocked: true };

                        // A sibling that reserved a pool host but never got its Zoom meeting
                        // minted already holds the family's one host slot -- join that
                        // reservation instead of resolving a second host for the same booking.
                        // Otherwise resolve one against everything the family's single Zoom
                        // booking has to cover: the union of its Zoom-bearing schedules' weekdays,
                        // at the time of day and duration they share (write/meeting/route.ts's
                        // zoomCandidate does the same). Checking this row's days alone could
                        // reserve a host that is already booked on the sibling's days.
                        const pattern = meetingForCalendar.recurrencePattern;
                        const familyCandidate = pattern
                            ? {
                                ...meetingForCalendar,
                                recurrencePattern: {
                                    ...pattern,
                                    daysOfWeek: [...new Set([
                                        ...(pattern.daysOfWeek ?? []),
                                        ...lockedSiblings.flatMap((row) => row.recurrencePattern?.daysOfWeek ?? []),
                                    ])],
                                },
                            }
                            : meetingForCalendar;
                        const resolved = lockedSiblings.find((row) => row.zoomHost)?.zoomHost
                            ?? await resolveZoomHost(familyCandidate, tx, { excludeMid: mid, capacities: hostCapacities });
                        if (resolved) {
                            // The claim, and the reservation itself: written to every Zoom-bearing
                            // family member, not just the retried row, so a concurrent retry that
                            // acquires this same family lock next sees the family is already
                            // spoken for and defers rather than resolving its own host and minting
                            // a second meeting. Widening an existing single-row reservation write,
                            // not a new mechanism.
                            await tx.meeting.updateMany({
                                where: { mid: { in: [mid, ...lockedSiblings.map((row) => row.mid)] } },
                                data: { zoomHost: resolved },
                            });
                        }
                        return { siblings: lockedSiblings, holder: null, host: resolved, blocked: false };
                    }, { timeout: 10_000 });

                    familySiblings = reservation.siblings;
                    holder = reservation.holder;
                    mintHost = reservation.host;
                    if (reservation.blocked) {
                        mintBlockedError = "This schedule's shared Zoom meeting is already being created by another retry. Try again in a moment.";
                    }
                }

                const holderZid = holder?.zid ?? null;
                if (holder && holderZid) {
                    // The family's Zoom meeting already exists: adopt its identity and widen its
                    // schedule to cover this row's days, rather than provisioning a second one.
                    zid = holderZid;
                    zoomLink = holder.zoomLink;
                    zoomPasscode = holder.zoomPasscode;
                    zoomHost = holder.zoomHost;
                    // The family's one Zoom meeting is one meeting on one account: a row adopting
                    // it must adopt whether the app owns it too, or it would PATCH (or refuse to
                    // PATCH) a meeting on the opposite contract from its own family.
                    zoomManaged = holder.zoomManaged;
                    storedInvitation = holder.zoomInvitation;
                    // Unmanaged (adopted/external) Zoom meetings are never PATCHed -- same
                    // contract as the zid branch above; the stored link is all this row adopts.
                    if (holder.zoomManaged) {
                        const ok = await updateZoomMeeting(holderZid, meetingForCalendar, await loadFamily(holderZid));
                        if (!ok) {
                            zoomSynced = false;
                            zoomSyncError = "Couldn't update the shared Zoom meeting for this schedule.";
                        }
                    }
                } else if (mintHost) {
                    // Reserved above regardless of what happens next -- a createZoomMeeting
                    // failure below must not roll back the reservation (the final
                    // prisma.meeting.update further down re-persists this same value either way).
                    zoomHost = mintHost;
                    // Same family lookup as the PATCH branch above, minus the zid this row
                    // doesn't have yet -- the fresh Zoom meeting is minted with the family's
                    // union schedule and Zoom name from the start.
                    const family = await loadFamily(null);
                    const created = await createZoomMeeting(meetingForCalendar, mintHost, family);
                    if (created) {
                        zid = created.zid;
                        zoomLink = created.zoomLink;
                        zoomPasscode = created.zoomPasscode;
                        // The minted meeting belongs to the whole family, not to the row the
                        // admin happened to retry -- see the fan-out below. Only members holding
                        // no Zoom identity of their own: a sibling that is somehow zid-less but
                        // already carries a zoomLink (an adopted legacy row) has a link its
                        // calendar events already advertise, and nothing here would republish
                        // them if this fan-out overwrote it.
                        fanOutMids = familySiblings.filter((row) => !row.zid && !row.zoomLink).map((row) => row.mid);
                    } else {
                        zoomSynced = false;
                        zoomSyncError = "Failed to create the Zoom meeting.";
                    }
                } else {
                    zoomSynced = false;
                    zoomSyncError = mintBlockedError ?? "No Zoom host available for this meeting's schedule (pool exhausted).";
                }
            }

            // Only Hybrid meetings have a zoomRoom -- Remote's dedicated per-room Zoom-Room
            // calendar publish naturally no-ops here; its link is carried by the main
            // calType-calendar reconcile below instead.
            if (auth.accessToken && zoomLink && meeting.zoomRoom) {
                const calId = zoomRoomCalendarId[meeting.zoomRoom];
                if (calId) {
                    const meetingWithZoomLink = { ...meetingForCalendar, zoomLink };
                    const family = await loadFamily(zid);
                    if (zoomCalendarEventId) {
                        const { ok, error } = await updateCalendarEvent(auth.accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink, family);
                        if (!ok) {
                            zoomSynced = false;
                            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting's calendar event failed to update.";
                        }
                    } else {
                        const { id: eventId, error } = await createCalendarEvent(auth.accessToken, meetingWithZoomLink, calId, zoomLink, family);
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
            const zoomInvitation = zid ? (await getZoomMeetingInvitation(zid)) ?? storedInvitation : null;
            await prisma.meeting.update({
                where: { mid },
                data: {
                    zid, zoomLink, zoomPasscode, zoomInvitation, zoomHost, zoomManaged, zoomCalendarEventId, zoomSyncStatus, zoomSyncError,
                    // The stored copy now equals Zoom's truth (adopted above, or just created),
                    // so any persisted drift flag is resolved. A failed credentials fetch left
                    // stored values possibly stale -- the flag must survive it.
                    ...(zid && meeting.zid && !liveCredentialsFetched ? {} : { zoomDriftDetectedAt: null }),
                },
            });
            // The Zoom identity this retry minted is the FAMILY's, so every Zoom-bearing member
            // gets it -- a sibling left zid-less would look unprovisioned to its own "Retry sync"
            // and mint a second Zoom meeting (and reserve a second host) for one meeting. Only
            // the shared identity is fanned out: each sibling keeps its own sync statuses, so its
            // still-unpublished calendar events stay flagged until it is retried in turn.
            if (fanOutMids.length > 0) {
                await prisma.meeting.updateMany({
                    // The zid/zoomLink guard is re-asserted at write time, not just filtered on
                    // the read above: a sibling that acquired a Zoom identity of its own in the
                    // meantime keeps it.
                    where: { mid: { in: fanOutMids }, zid: null, zoomLink: null },
                    data: { zid, zoomLink, zoomPasscode, zoomInvitation, zoomHost },
                });
            }
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
                await loadFamily(zid),
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

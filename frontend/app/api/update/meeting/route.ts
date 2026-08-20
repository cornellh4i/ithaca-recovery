import { Meeting, Prisma, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../types/models";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars } from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomHostCapacities, getZoomMeetingInvitation, resolveZoomHost, zoomHostPool, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, findResourceConflictRows, ConflictRow, ResourceConflictAbort } from "../../../../util/meetings/resourceOverlap";
import { lockResourceClaims, ResourceClaim } from "../../../../util/meetings/resourceLocks";
import { meetingSchema } from "../../../../util/meetings/meetingValidation";
import { reconcilePendingResume } from "../../../../util/meetings/suspension";
import { calculateEndDateFromOccurrences } from "../../../../util/meetings/meetingOccurrences";
import { prisma } from "../../../../lib/prisma";

// Runs after the response is sent (see after() call below) — failure updates googleSyncStatus
// but does not fail the request, which has already returned by the time this runs.
//
// Zoom resolves/updates FIRST, before the main calType-calendar reconcile -- same reasoning
// as write/meeting/route.ts's syncNewMeeting: the calType events need the real zoomLink (they
// were passed a zoomLink-less object before), and a meeting that needs Zoom but doesn't have a
// working one after this run (host pool exhausted, API error) skips the calendar reconcile
// entirely rather than publishing "fully scheduled" with a missing link -- the "Retry sync"
// route (update/meeting/sync/route.ts) picks it back up once a host becomes available.
async function syncUpdatedMeeting(
  mid: string,
  newMeeting: IMeeting,
  existingMeeting: Meeting,
  accessToken: string | undefined,
  resolvedHost: string | null,
  // The specific reason resolvedHost is null (pool exhausted vs. a manually-picked host that
  // conflicts) -- computed synchronously in updateMeeting, before this ever runs. Without this,
  // both reasons collapsed to the same generic "pool exhausted" message below.
  hostSyncError: string | null,
): Promise<void> {
  if (newMeeting.status === 'Suspended') return;

  const zoomEnabled = newMeeting.modeType === 'Hybrid' || newMeeting.modeType === 'Remote';

  const oldZoomRoom = existingMeeting.zoomRoom;
  const newZoomRoom = newMeeting.zoomRoom;
  let zid = existingMeeting.zid;
  let zoomLink = existingMeeting.zoomLink;
  let zoomPasscode = existingMeeting.zoomPasscode;
  let zoomHost = existingMeeting.zoomHost;
  let zoomCalendarEventId = existingMeeting.zoomCalendarEventId;
  let zoomSynced = true;
  let zoomSyncError: string | null = null;
  // Set true when the kept Zoom meeting couldn't actually be moved to the new time (a host
  // time-conflict, below) -- read outside this block by zoomBlocking, so the calType calendar
  // reconcile doesn't publish the new time while Zoom itself is still sitting at the old one.
  let skipCalendarTimeSync = false;

  if (zoomEnabled) {
    // A Zoom meeting can't move rooms or change host in place -- tear down and recreate
    // whenever the room changes, or an admin explicitly reassigns the host via the Zoom Host
    // dropdown. A blank/"Automatic" selection is NOT a reassignment -- it just means "don't
    // force a specific host," so whatever host is already assigned is kept as-is.
    const roomChanged = !!oldZoomRoom && oldZoomRoom !== newZoomRoom;
    const explicitHostChange = !!newMeeting.zoomHost && newMeeting.zoomHost !== existingMeeting.zoomHost;

    if ((roomChanged || explicitHostChange) && existingMeeting.zoomManaged) {
      if (zid) {
        const ok = await deleteZoomMeeting(zid);
        if (!ok) zoomSynced = false;
      }
      if (accessToken && zoomCalendarEventId && oldZoomRoom) {
        const oldCalId = zoomRoomCalendarId[oldZoomRoom];
        if (oldCalId) {
          const ok = await deleteCalendarEvent(accessToken, zoomCalendarEventId, oldCalId);
          if (!ok) zoomSynced = false;
        }
      }
      zid = null;
      zoomLink = null;
      zoomPasscode = null;
      zoomHost = null;
      zoomCalendarEventId = null;
    }

    // Same existing Zoom meeting kept -- keep the host that's already assigned; no
    // re-resolution, so an existing recurring meeting never loses its host mid-series. But
    // the time itself may have changed, so re-check that the current host is still free for
    // the new schedule before pushing the update to Zoom — otherwise a time edit could
    // silently double-book a host that's fine for the old time but busy at the new one.
    if (zid) {
      const timeConflicts = zoomHost
        ? await findResourceConflicts("zoomHost", zoomHost, newMeeting, prisma, {
            excludeMid: mid,
            includeSuspended: true,
            capacity: (await getZoomHostCapacities())[zoomHost] ?? 1,
          })
        : [];
      if (timeConflicts.length > 0) {
        zoomSynced = false;
        zoomSyncError = "This time now conflicts with another meeting using the same Zoom host.";
        skipCalendarTimeSync = true;
      } else {
        // Unmanaged Zoom meetings are never PATCHed -- the stored link is the contract; only
        // the calendars follow the app-side edit.
        const ok = existingMeeting.zoomManaged ? await updateZoomMeeting(zid, newMeeting) : true;
        if (!ok) zoomSynced = false;
      }
    } else {
      // Already resolved (and persisted) synchronously in updateMeeting, before this ever
      // runs — see the comment there for why. This only does the network-bound half:
      // actually creating the Zoom meeting under that host.
      const host = resolvedHost;
      if (!host) {
        zoomSynced = false;
        zoomSyncError = hostSyncError ?? "No Zoom host available for this meeting's schedule (pool exhausted).";
      } else {
        const created = await createZoomMeeting(newMeeting, host);
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

    // Only Hybrid meetings have a zoomRoom -- Remote's dedicated per-room Zoom-Room calendar
    // publish naturally no-ops here; its Zoom link is carried by the main calType-calendar
    // reconcile below instead. zoomCalendarEventId is null whenever the teardown above ran
    // (room change or host reassignment), so checking it alone decides update-vs-create here.
    if (accessToken && zoomLink && newZoomRoom && !skipCalendarTimeSync) {
      const calId = zoomRoomCalendarId[newZoomRoom];
      if (calId) {
        const meetingWithZoomLink = { ...newMeeting, zoomLink };
        if (zoomCalendarEventId) {
          const { ok, error } = await updateCalendarEvent(accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink);
          if (!ok) {
            zoomSynced = false;
            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting's calendar event failed to update.";
          }
        } else {
          const { id: eventId, error } = await createCalendarEvent(accessToken, meetingWithZoomLink, calId, zoomLink);
          if (eventId) zoomCalendarEventId = eventId;
          else {
            zoomSynced = false;
            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting created but its calendar event failed to sync.";
          }
        }
      }
    }
  }

  // True when this meeting needs Zoom but doesn't have a working Zoom meeting after the
  // block above (host pool exhausted / API failure), OR the kept Zoom meeting couldn't be
  // moved to the new time (a host time-conflict, see skipCalendarTimeSync above) -- either
  // way, the calendar reconcile below is deferred, not run with a missing or stale link.
  const zoomBlocking = zoomEnabled && (!zid || skipCalendarTimeSync);
  const meetingForCalendar: IMeeting = { ...newMeeting, zoomLink };

  if (zoomBlocking) {
    await prisma.meeting.update({ where: { mid }, data: { googleSyncStatus: 'pending' } });
  } else if (accessToken) {
    const existingEventIds = (existingMeeting.googleCalendarEventIds ?? {}) as Record<string, string>;
    const { updatedEventIds, allSynced, googleSyncError } = await reconcileMeetingCalendars(
      accessToken,
      meetingForCalendar,
      existingEventIds,
    );

    await prisma.meeting.update({
      where: { mid },
      data: {
        googleCalendarEventIds: updatedEventIds,
        googleSyncStatus: allSynced ? 'synced' : 'error',
        googleSyncError: allSynced ? null : googleSyncError,
      },
    });
  } else {
    // No accessToken and not zoomBlocking -- without this branch googleSyncStatus is never
    // touched by this run, leaving it at whatever it already was (often null) with nothing
    // surfacing the failure to an admin.
    await prisma.meeting.update({
      where: { mid },
      data: { googleSyncStatus: 'error', googleSyncError: "No Google Calendar access token available for this sync." },
    });
  }

  if (zoomEnabled) {
    // Scoped to its own try/catch, separate from the outer after()'s .catch() in the route
    // handler -- by this point the googleSyncStatus write above has unconditionally already
    // happened (every branch of the if/else-if/else above writes it), so a throw here must
    // never be allowed to reach that outer catch and overwrite an already-correct
    // googleSyncStatus with 'error' while misattributing a Zoom-side failure as a Google one.
    try {
      // getZoomMeetingInvitation collapses every failure mode (missing scope, non-2xx, network
      // error) to null, so a fetch failure here shouldn't overwrite an already-stored invitation
      // for a Zoom meeting that's otherwise unchanged -- only a torn-down zid actually clears it.
      const zoomInvitation = zid ? (await getZoomMeetingInvitation(zid)) ?? existingMeeting.zoomInvitation : null;

      await prisma.meeting.update({
        where: { mid },
        data: {
          zid, zoomLink, zoomPasscode, zoomInvitation, zoomHost, zoomCalendarEventId,
          zoomSyncStatus: zoomSynced ? 'synced' : 'error',
          zoomSyncError: zoomSynced ? null : zoomSyncError,
        },
      });
    } catch (error) {
      console.error("syncUpdatedMeeting: failed to persist the final Zoom sync status:", error);
      try {
        await prisma.meeting.update({
          where: { mid },
          data: { zoomSyncStatus: 'error', zoomSyncError: "Zoom sync status update failed unexpectedly." },
        });
      } catch (persistError) {
        console.error("Failed to persist Zoom sync failure status:", persistError);
      }
    }
  }
}

const updateMeeting = async (request: Request): Promise<Response> => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const parsed = meetingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid meeting data", issues: parsed.error.issues }, { status: 400 });
    }
    const newMeeting = parsed.data as IMeeting;

    // Read before lockResourceClaims acquires anything below -- accepted gap, not covered by
    // this fix: two concurrent edits to this *same* meeting could each compute
    // explicitHostChange/needsNewHost from a stale snapshot of each other's not-yet-committed
    // change. This fix closes the race between DIFFERENT meetings racing for the same room/
    // zoomRoom/zoomHost value (the actual PR #303 gap); two edits racing on the identical `mid`
    // is a separate, narrower same-record concurrency question this pass doesn't address.
    const existingMeeting = await prisma.meeting.findUnique({
      where: {
        mid: newMeeting.mid,
      },
      include: { recurrencePattern: true, suspensions: true },
    });

    if (!existingMeeting) {
      console.error('Meeting not found:', newMeeting.mid);
      return NextResponse.json({ error: `Meeting with ID ${newMeeting.mid} not found` }, { status: 404 });
    }

    // Lazy self-heal: promote a scheduled resume's pre-created GCal series into
    // googleCalendarEventIds if its date has arrived but nothing's promoted it yet, before this
    // edit reads/writes that field below.
    existingMeeting.googleCalendarEventIds = await reconcilePendingResume(existingMeeting);

    // creator is server-managed provenance (set from the session at create time) -- an update
    // must never overwrite it with the client's placeholder value.
    const { mid, recurrencePattern, confirmOverride, creator: _creator, ...meetingFields } = newMeeting;

    // An explicit host reassignment (the Zoom Host dropdown set to a specific pool host,
    // different from whatever's currently assigned) -- hoisted above the confirmOverride block
    // below so the blocking conflict check can use it too, not just the resolution step further
    // down. A blank/"Automatic" selection, or resubmitting the form with the same
    // already-assigned host untouched, is NOT a reassignment.
    const explicitHostChange = !!newMeeting.zoomHost && newMeeting.zoomHost !== existingMeeting.zoomHost;

    // An unmanaged Zoom meeting (adopted legacy / externally hosted -- see schema.prisma's
    // zoomManaged) can't be torn down and recreated by the app: a room or host change would
    // silently replace the group's long-lived meeting ID. Reject up front with a clear message
    // instead of half-applying the edit.
    if (!existingMeeting.zoomManaged) {
      const roomChangedUnmanaged = !!existingMeeting.zoomRoom && newMeeting.zoomRoom !== existingMeeting.zoomRoom;
      if (roomChangedUnmanaged || explicitHostChange) {
        return NextResponse.json(
          { error: "This meeting's Zoom meeting is owned outside the app (legacy/external). Changing its Zoom room or host would replace the group's long-standing meeting ID — coordinate with ICR instead." },
          { status: 422 },
        );
      }
    }

    // A count-bounded series (numberOfOccurrences set, no explicit endDate) has a real last
    // occurrence -- checking conflicts against the raw (still-null) endDate would expand it out
    // to the full OVERLAP_HORIZON_YEARS window instead, risking a false 409/false zoomHost
    // conflict against an unrelated booking that falls after the series actually ends. Built
    // once, reused for every conflict/candidate check below (the blocking check, the zoomHost
    // re-check, and the pool-auto-assign call) -- only affects these checks, not what's
    // persisted (unchanged from the existing upsert further down).
    let calculatedEndDate = recurrencePattern?.endDate ?? null;
    if (recurrencePattern?.numberOfOccurrences && !recurrencePattern.endDate) {
      calculatedEndDate = calculateEndDateFromOccurrences(
        recurrencePattern.startDate,
        recurrencePattern.daysOfWeek || [],
        recurrencePattern.numberOfOccurrences,
        recurrencePattern.interval || 1,
        recurrencePattern.type,
        recurrencePattern.weekOfMonth ?? null,
        recurrencePattern.dayOfMonth ?? null,
      );
    }
    const candidate = {
      ...newMeeting,
      isRecurring: !!recurrencePattern,
      recurrencePattern: recurrencePattern ? { ...recurrencePattern, endDate: calculatedEndDate } : null,
    };

    // A new Zoom host is only needed when this meeting has no Zoom meeting to keep using —
    // either it never had one, or its room changed (a Zoom meeting can't move rooms, so the
    // old one gets torn down and a new host resolved).
    const zoomEnabled = newMeeting.status !== 'Suspended'
      && (newMeeting.modeType === 'Hybrid' || newMeeting.modeType === 'Remote');
    // explicitHostChange (hoisted above) needs a fresh Zoom meeting too, same as a room change --
    // Zoom has no in-place host-transfer for this app's stable-meeting model.
    // Remote meetings submit zoomRoom as "" (no Zoom Room field at all), while older stored
    // rows may hold null for the same "no room" state -- normalize both sides so an unchanged
    // Remote meeting isn't misdetected as a room change and torn down/recreated for nothing.
    const needsNewHost =
      zoomEnabled &&
      (!existingMeeting.zid ||
        (existingMeeting.zoomRoom || "") !== (newMeeting.zoomRoom || "") ||
        explicitHostChange);

    // Pure/cheap (no DB) -- only decides which claims to lock below. The actual pool-host
    // resolution runs on `tx`, after every pool host is locked, inside the transaction (see the
    // zoomHost-resolution block further down) -- same reasoning as write/meeting/route.ts, closes
    // #360's TOCTOU gap.
    const needsAutoHost = needsNewHost && !newMeeting.zoomHost;

    let resolvedHost: string | null = null;
    let hostSyncError: string | null = null;

    // License-dependent per-host capacities, resolved BEFORE the locked transaction below — a
    // Zoom API round trip while pool advisory locks are held would extend lock hold time by an
    // external call's latency (cached 12h, so this is usually a no-op; see services/zoom.ts).
    const hostCapacities = await getZoomHostCapacities();

    // Everything from the conflict check through the Meeting(+RecurrencePattern) write runs
    // inside one transaction, guarded by a single lockResourceClaims call -- this closes the
    // check-then-write race (two concurrent requests could both pass the conflict check before
    // either wrote, and both succeed), the same fix as write/meeting/route.ts, now including
    // #360's pool-auto-assignment gap (every zoomHostPool candidate locked here too). Explicit
    // timeout: with the whole pool now locked and resolved in-transaction, lock-wait time under
    // real pool contention is no longer bounded by Prisma's 5s default -- 10s is a conservative
    // starting point pending the real measurement in ithaca-recovery-zoom-host-pool-race-plan.md.
    // maxWait raised alongside it for the same reason: every concurrent auto-assign request now
    // holds a pooled connection for its full lock wait, so a burst of them can exhaust Prisma's
    // default 2s connection-acquisition budget before a queued request even starts waiting on the
    // lock itself.
    let updatedMeeting: Meeting;
    try {
      updatedMeeting = await prisma.$transaction(async (tx) => {
        const claims: ResourceClaim[] = [];
        if (newMeeting.room) claims.push({ type: "room", value: newMeeting.room });
        if (newMeeting.zoomRoom) claims.push({ type: "zoomRoom", value: newMeeting.zoomRoom });
        if (newMeeting.zoomHost) claims.push({ type: "zoomHost", value: newMeeting.zoomHost });
        if (needsAutoHost) {
          for (const host of zoomHostPool) claims.push({ type: "zoomHost", value: host });
        }
        await lockResourceClaims(tx, claims);

        // Blocks the save outright on a room/zoomRoom collision, or an explicit zoomHost
        // reassignment that collides with another meeting's -- distinct from the pool-auto-
        // assignment path above, which defers the calendar publish and stores the error on the
        // meeting instead of rejecting the request (there's no "other host to pick instead" for
        // a plain pool-exhaustion the way there is for a room or an explicit host choice).
        // confirmOverride only bypasses this block, not the pool's handling. Deliberately
        // scoped to explicitHostChange, not bare newMeeting.zoomHost -- an edit that leaves the
        // Zoom Host dropdown on the meeting's own already-assigned host must not re-trigger this
        // check just because the field happens to be populated in the resubmitted form.
        if (!confirmOverride) {
          const conflictRows: ConflictRow[] = [];
          if (newMeeting.room) {
            conflictRows.push(...await findResourceConflictRows("room", newMeeting.room, candidate, tx, { excludeMid: mid }));
          }
          if (newMeeting.zoomRoom) {
            conflictRows.push(...await findResourceConflictRows("zoomRoom", newMeeting.zoomRoom, candidate, tx, { excludeMid: mid }));
          }
          if (explicitHostChange && newMeeting.zoomHost) {
            conflictRows.push(...await findResourceConflictRows(
              "zoomHost", newMeeting.zoomHost, candidate, tx,
              { excludeMid: mid, includeSuspended: true, capacity: hostCapacities[newMeeting.zoomHost] ?? 1 },
            ));
          }
          if (conflictRows.length > 0) {
            throw new ResourceConflictAbort(conflictRows);
          }
        }

        // The specific pool host an explicit pick collided with (kept even though resolvedHost
        // stays null) -- see the attemptedZoomHost field comment in schema.prisma for why.
        let attemptedZoomHost: string | null = null;
        if (needsNewHost) {
          if (newMeeting.zoomHost) {
            // A conflicting explicitHostChange is already blocked with a 409 above unless
            // confirmOverride was set. This branch also runs, non-blocking, for needsNewHost
            // cases that aren't an explicit host change (e.g. a room change resubmitted with the
            // same already-assigned host) -- either way, a real conflict here is treated the
            // same as pool exhaustion below: nothing gets written to the external Zoom API, and
            // the calendar publish is deferred until an admin picks a different host or the
            // conflict clears.
            // Only re-query when the blocking check above didn't already prove this exact
            // field/value/candidate clean -- that's true only when !confirmOverride AND
            // explicitHostChange (the blocking check's own zoomHost gating condition); a plain
            // room-change-only needsNewHost case never had this value checked yet, so it still
            // needs a real query even when !confirmOverride.
            const alreadyCheckedClean = !confirmOverride && explicitHostChange;
            const conflicts = alreadyCheckedClean
              ? []
              : await findResourceConflicts(
                  "zoomHost", newMeeting.zoomHost, candidate, tx,
                  { excludeMid: mid, includeSuspended: true, capacity: hostCapacities[newMeeting.zoomHost] ?? 1 },
                );
            if (conflicts.length === 0) {
              resolvedHost = newMeeting.zoomHost;
            } else {
              hostSyncError = "This time conflicts with another meeting using the same Zoom host.";
              attemptedZoomHost = newMeeting.zoomHost;
            }
          } else {
            const poolResolvedHost = await resolveZoomHost(candidate, tx, { excludeMid: mid, capacities: hostCapacities });
            resolvedHost = poolResolvedHost;
            hostSyncError = poolResolvedHost
              ? null
              : "No Zoom host available for this meeting's schedule (pool exhausted).";
          }
        }

        return tx.meeting.update({
          where: {
            mid: mid,
          },
          data: {
            ...meetingFields,
            // Server-managed provenance, like creator at create time -- who last saved an edit.
            lastEditedBy: auth.user?.email ?? null,
            // Postgres' Json columns reject a literal `null` on write (needs the Prisma.DbNull
            // sentinel for a real SQL NULL) -- Mongo's connector accepted plain `null` here directly.
            // Left `undefined` when the client didn't send the field at all (the normal case --
            // this is server-managed, updated below by syncUpdatedMeeting) so this update doesn't
            // touch/clear the column; only an explicit `null` maps to a real clear.
            googleCalendarEventIds:
              meetingFields.googleCalendarEventIds === null ? Prisma.DbNull : meetingFields.googleCalendarEventIds,
            ...(needsNewHost
              ? {
                  zoomHost: resolvedHost,
                  attemptedZoomHost,
                  ...(hostSyncError ? { zoomSyncStatus: 'error', zoomSyncError: hostSyncError } : {}),
                }
              : !zoomEnabled
                ? { attemptedZoomHost: null }
                : {}),
            recurrencePattern: recurrencePattern
              ? {
                  upsert: {
                    update: {
                      type: recurrencePattern.type,
                      startDate: recurrencePattern.startDate,
                      endDate: calculatedEndDate,
                      numberOfOccurrences: recurrencePattern.numberOfOccurrences ?? undefined,
                      daysOfWeek: recurrencePattern.daysOfWeek ?? [],
                      firstDayOfWeek: recurrencePattern.firstDayOfWeek,
                      interval: recurrencePattern.interval,
                      weekOfMonth: recurrencePattern.weekOfMonth ?? null,
                      dayOfMonth: recurrencePattern.dayOfMonth ?? null,
                    },
                    create: {
                      type: recurrencePattern.type,
                      startDate: recurrencePattern.startDate,
                      endDate: calculatedEndDate,
                      numberOfOccurrences: recurrencePattern.numberOfOccurrences ?? undefined,
                      daysOfWeek: recurrencePattern.daysOfWeek ?? [],
                      firstDayOfWeek: recurrencePattern.firstDayOfWeek,
                      interval: recurrencePattern.interval,
                      weekOfMonth: recurrencePattern.weekOfMonth ?? null,
                      dayOfMonth: recurrencePattern.dayOfMonth ?? null,
                    },
                  },
                }
              : existingMeeting.recurrencePattern
                ? { delete: true }
                : undefined,
          },
        });
      }, { timeout: 10_000, maxWait: 10_000 });
    } catch (error) {
      if (error instanceof ResourceConflictAbort) {
        return NextResponse.json(
          { error: "This meeting conflicts with an existing meeting's room, Zoom room, or Zoom host.", conflicts: error.conflicts },
          { status: 409 },
        );
      }
      throw error;
    }

    // GCal/Zoom sync runs after the response is sent — see syncUpdatedMeeting above. Caught here
    // so a throw mid-sync (as opposed to a handled failure, which syncUpdatedMeeting already
    // persists as an error status itself) doesn't vanish as a silent unhandled rejection,
    // leaving the meeting's sync status at whatever it was before this run. Only reachable from
    // a throw at-or-before syncUpdatedMeeting's googleSyncStatus write (its trailing Zoom-status
    // write has its own local try/catch specifically so a Zoom-side failure there can't reach
    // here and overwrite an already-correct googleSyncStatus) -- so marking googleSyncStatus
    // 'error' here is always safe, and zoomSyncStatus is marked too since a crash this early
    // means whatever Zoom-side state exists can't be trusted as accurate either.
    after(
      syncUpdatedMeeting(mid, newMeeting, existingMeeting, auth.accessToken, resolvedHost, hostSyncError)
        .catch(async (error) => {
          console.error("syncUpdatedMeeting threw:", error);
          try {
            await prisma.meeting.update({
              where: { mid },
              data: {
                googleSyncStatus: 'error',
                googleSyncError: "Sync job failed unexpectedly.",
                ...(zoomEnabled ? { zoomSyncStatus: 'error' as const, zoomSyncError: "Sync job failed unexpectedly." } : {}),
              },
            });
          } catch (persistError) {
            console.error("Failed to persist sync failure status:", persistError);
          }
        }),
    );

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
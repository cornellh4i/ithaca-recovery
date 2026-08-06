import { Meeting, Prisma, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars } from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, findResourceConflictRows, ConflictRow } from "../../../../util/resourceOverlap";
import { meetingSchema } from "../../../../util/meetingValidation";
import { reconcilePendingResume } from "../../../../util/suspension";
import { calculateEndDateFromOccurrences } from "../../../../util/meetingOccurrences";
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

    if (roomChanged || explicitHostChange) {
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
        ? await findResourceConflicts("zoomHost", zoomHost, newMeeting, { excludeMid: mid, includeSuspended: true })
        : [];
      if (timeConflicts.length > 0) {
        zoomSynced = false;
        zoomSyncError = "This time now conflicts with another meeting using the same Zoom host.";
        skipCalendarTimeSync = true;
      } else {
        const ok = await updateZoomMeeting(zid, newMeeting);
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
  }

  if (zoomEnabled) {
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

    const { mid, recurrencePattern, confirmOverride, ...meetingFields } = newMeeting;

    // An explicit host reassignment (the Zoom Host dropdown set to a specific pool host,
    // different from whatever's currently assigned) -- hoisted above the confirmOverride block
    // below so the blocking conflict check can use it too, not just the resolution step further
    // down. A blank/"Automatic" selection, or resubmitting the form with the same
    // already-assigned host untouched, is NOT a reassignment.
    const explicitHostChange = !!newMeeting.zoomHost && newMeeting.zoomHost !== existingMeeting.zoomHost;

    // Blocks the save outright on a room/zoomRoom collision, or an explicit zoomHost
    // reassignment that collides with another meeting's -- distinct from the pool-auto-
    // assignment path below, which defers the calendar publish and stores the error on the
    // meeting instead of rejecting the request (there's no "other host to pick instead" for a
    // plain pool-exhaustion the way there is for a room or an explicit host choice).
    // confirmOverride only bypasses this block, not the pool's handling. Deliberately scoped to
    // explicitHostChange, not bare newMeeting.zoomHost -- an edit that leaves the Zoom Host
    // dropdown on the meeting's own already-assigned host must not re-trigger this check just
    // because the field happens to be populated in the resubmitted form.
    if (!confirmOverride) {
      // A count-bounded series (numberOfOccurrences set, no explicit endDate) has a real last
      // occurrence -- checking conflicts against the raw (still-null) endDate would expand it
      // out to the full OVERLAP_HORIZON_YEARS window instead, risking a false 409 against an
      // unrelated booking that falls after the series actually ends. Only affects the conflict
      // candidate below, not what's persisted (unchanged from the existing upsert further down).
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
      const conflictCandidate = {
        ...newMeeting,
        recurrencePattern: recurrencePattern ? { ...recurrencePattern, endDate: calculatedEndDate } : null,
      };

      const conflictRows: ConflictRow[] = [];
      if (newMeeting.room) {
        conflictRows.push(...await findResourceConflictRows("room", newMeeting.room, conflictCandidate, { excludeMid: mid }));
      }
      if (newMeeting.zoomRoom) {
        conflictRows.push(...await findResourceConflictRows("zoomRoom", newMeeting.zoomRoom, conflictCandidate, { excludeMid: mid }));
      }
      if (explicitHostChange && newMeeting.zoomHost) {
        conflictRows.push(...await findResourceConflictRows(
          "zoomHost", newMeeting.zoomHost, conflictCandidate, { excludeMid: mid, includeSuspended: true },
        ));
      }
      if (conflictRows.length > 0) {
        return NextResponse.json(
          { error: "This meeting conflicts with an existing meeting's room, Zoom room, or Zoom host.", conflicts: conflictRows },
          { status: 409 },
        );
      }
    }

    // A new Zoom host is only needed when this meeting has no Zoom meeting to keep using —
    // either it never had one, or its room changed (a Zoom meeting can't move rooms, so the
    // old one gets torn down and a new host resolved). Resolve and persist that host here,
    // synchronously and immediately, rather than inside the deferred after() job below —
    // otherwise the gap between "check the host is free" and "commit it to this meeting"
    // spans several Zoom/Calendar API calls, during which a concurrent request could resolve
    // and commit the same host. This doesn't fully close the race (that would need an atomic
    // claim), but it shrinks the window down to a single DB round trip.
    const zoomEnabled = newMeeting.status !== 'Suspended'
      && (newMeeting.modeType === 'Hybrid' || newMeeting.modeType === 'Remote');
    // explicitHostChange (hoisted above, before the confirmOverride block) needs a fresh Zoom
    // meeting too, same as a room change -- Zoom has no in-place host-transfer for this app's
    // stable-meeting model.
    // Remote meetings submit zoomRoom as "" (no Zoom Room field at all), while older stored
    // rows may hold null for the same "no room" state -- normalize both sides so an unchanged
    // Remote meeting isn't misdetected as a room change and torn down/recreated for nothing.
    const needsNewHost =
      zoomEnabled &&
      (!existingMeeting.zid ||
        (existingMeeting.zoomRoom || "") !== (newMeeting.zoomRoom || "") ||
        explicitHostChange);

    let resolvedHost: string | null = null;
    let hostSyncError: string | null = null;
    // The specific pool host an explicit pick collided with (kept even though resolvedHost
    // stays null) -- see the attemptedZoomHost field comment in schema.prisma for why.
    let attemptedZoomHost: string | null = null;
    if (needsNewHost) {
      if (newMeeting.zoomHost) {
        // A conflicting explicitHostChange is already blocked with a 409 above unless
        // confirmOverride was set. This branch also runs, non-blocking, for needsNewHost cases
        // that aren't an explicit host change (e.g. a room change resubmitted with the same
        // already-assigned host) -- either way, a real conflict here is treated the same as pool
        // exhaustion below: nothing gets written to the external Zoom API, and the calendar
        // publish is deferred until an admin picks a different host or the conflict clears.
        const conflicts = await findResourceConflicts(
          "zoomHost", newMeeting.zoomHost, newMeeting, { excludeMid: mid, includeSuspended: true },
        );
        if (conflicts.length === 0) {
          resolvedHost = newMeeting.zoomHost;
        } else {
          hostSyncError = "This time conflicts with another meeting using the same Zoom host.";
          attemptedZoomHost = newMeeting.zoomHost;
        }
      } else {
        resolvedHost = await resolveZoomHost(newMeeting, { excludeMid: mid });
        if (!resolvedHost) {
          hostSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
        }
      }
    }

    // Verified atomic: this single call's nested recurrencePattern upsert/delete is a nested
    // write, and Prisma's MongoDB connector wraps nested writes in an internal transaction
    // automatically -- unlike write/meeting/route.ts's create path (two separate top-level
    // calls), there's no unwrapped-multi-write gap here to fix.
    const updatedMeeting = await prisma.meeting.update({
      where: {
        mid: mid,
      },
      data: {
        ...meetingFields,
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
                  endDate: recurrencePattern.endDate ?? undefined,
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
                  endDate: recurrencePattern.endDate ?? undefined,
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
    

    // GCal/Zoom sync runs after the response is sent — see syncUpdatedMeeting above.
    after(syncUpdatedMeeting(mid, newMeeting, existingMeeting, auth.accessToken, resolvedHost, hostSyncError));

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
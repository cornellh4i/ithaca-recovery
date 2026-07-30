import { Meeting, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars } from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts } from "../../../../util/resourceOverlap";
import { meetingSchema } from "../../../../util/meetingValidation";
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
        zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
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
          const ok = await updateCalendarEvent(accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink);
          if (!ok) zoomSynced = false;
        } else {
          const eventId = await createCalendarEvent(accessToken, meetingWithZoomLink, calId, zoomLink);
          if (eventId) zoomCalendarEventId = eventId;
          else {
            zoomSynced = false;
            zoomSyncError = zoomSyncError ?? "Zoom meeting created but its calendar event failed to sync.";
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
    const { updatedEventIds, allSynced } = await reconcileMeetingCalendars(
      accessToken,
      meetingForCalendar,
      existingEventIds,
    );

    await prisma.meeting.update({
      where: { mid },
      data: {
        googleCalendarEventIds: updatedEventIds,
        googleSyncStatus: allSynced ? 'synced' : 'error',
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
      include: { recurrencePattern: true },
    });

    if (!existingMeeting) {
      console.error('Meeting not found:', newMeeting.mid);
      return NextResponse.json({ error: `Meeting with ID ${newMeeting.mid} not found` }, { status: 404 });
    }

    const { mid, recurrencePattern, ...meetingFields } = newMeeting;

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
    // An explicit host reassignment (the Zoom Host dropdown set to a specific pool host,
    // different from whatever's currently assigned) needs a fresh Zoom meeting too, same as
    // a room change -- Zoom has no in-place host-transfer for this app's stable-meeting model.
    const explicitHostChange = !!newMeeting.zoomHost && newMeeting.zoomHost !== existingMeeting.zoomHost;
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
    if (needsNewHost) {
      // A manually-selected host is used as-is, no server-side conflict re-check -- see the
      // matching comment in write/meeting/route.ts.
      resolvedHost = newMeeting.zoomHost || (await resolveZoomHost(newMeeting, { excludeMid: mid }));
      if (!resolvedHost) {
        hostSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
      }
    }

    const updatedMeeting = await prisma.meeting.update({
      where: {
        mid: mid,
      },
      data: {
        ...meetingFields,
        ...(needsNewHost
          ? {
              zoomHost: resolvedHost,
              ...(hostSyncError ? { zoomSyncStatus: 'error', zoomSyncError: hostSyncError } : {}),
            }
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
    after(syncUpdatedMeeting(mid, newMeeting, existingMeeting, auth.accessToken, resolvedHost));

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
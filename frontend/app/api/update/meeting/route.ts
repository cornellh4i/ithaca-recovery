import { Meeting, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars } from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts } from "../../../../util/resourceOverlap";
import { meetingSchema } from "../../../../util/meetingValidation";
import { prisma } from "../../../../lib/prisma";

// Runs after the response is sent (see after() call below) — failure updates syncStatus
// but does not fail the request, which has already returned by the time this runs.
async function syncUpdatedMeeting(
  mid: string,
  newMeeting: IMeeting,
  existingMeeting: Meeting,
  accessToken: string | undefined,
  resolvedHost: string | null,
): Promise<void> {
  if (accessToken && newMeeting.status !== 'Suspended') {
    const existingEventIds = (existingMeeting.googleCalendarEventIds ?? {}) as Record<string, string>;
    const { updatedEventIds, allSynced } = await reconcileMeetingCalendars(
      accessToken,
      newMeeting,
      existingEventIds,
    );

    await prisma.meeting.update({
      where: { mid },
      data: {
        googleCalendarEventIds: updatedEventIds,
        syncStatus: allSynced ? 'synced' : 'error',
      },
    });
  }

  if (newMeeting.status !== 'Suspended') {
    const oldZoomRoom = existingMeeting.zoomRoom;
    const newZoomRoom = newMeeting.zoomRoom;
    let zid = existingMeeting.zid;
    let zoomLink = existingMeeting.zoomLink;
    let zoomPasscode = existingMeeting.zoomPasscode;
    let zoomHost = existingMeeting.zoomHost;
    let zoomCalendarEventId = existingMeeting.zoomCalendarEventId;
    let zoomSynced = true;
    let zoomSyncError: string | null = null;

    // Room changed or cleared — a Zoom meeting can't move rooms, so tear down and recreate.
    if (oldZoomRoom && oldZoomRoom !== newZoomRoom) {
      if (zid) {
        const ok = await deleteZoomMeeting(zid);
        if (!ok) zoomSynced = false;
      }
      if (accessToken && zoomCalendarEventId) {
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

    if (newZoomRoom) {
      // Same room, same existing Zoom meeting — keep the host that's already assigned; no
      // re-resolution, so an existing recurring meeting never loses its host mid-series. But
      // the time itself may have changed, so re-check that the current host is still free for
      // the new schedule before pushing the update to Zoom — otherwise a time edit could
      // silently double-book a host that's fine for the old time but busy at the new one.
      const sameRoomExisting = zid && oldZoomRoom === newZoomRoom;
      let skipCalendarTimeSync = false;
      if (sameRoomExisting) {
        const timeConflicts = zoomHost
          ? await findResourceConflicts("zoomHost", zoomHost, newMeeting, { excludeMid: mid, includeSuspended: true })
          : [];
        if (timeConflicts.length > 0) {
          zoomSynced = false;
          zoomSyncError = "This time now conflicts with another meeting using the same Zoom host.";
          skipCalendarTimeSync = true;
        } else {
          const ok = await updateZoomMeeting(zid as string, newMeeting);
          if (!ok) zoomSynced = false;
        }
      } else if (!zid) {
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

      if (accessToken && zoomLink && !skipCalendarTimeSync) {
        const calId = zoomRoomCalendarId[newZoomRoom];
        if (calId) {
          const meetingWithZoomLink = { ...newMeeting, zoomLink };
          if (zoomCalendarEventId && sameRoomExisting) {
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
    const needsNewHost =
      newMeeting.status !== 'Suspended' &&
      !!newMeeting.zoomRoom &&
      (!existingMeeting.zid || existingMeeting.zoomRoom !== newMeeting.zoomRoom);

    let resolvedHost: string | null = null;
    let hostSyncError: string | null = null;
    if (needsNewHost) {
      resolvedHost = await resolveZoomHost(newMeeting, { excludeMid: mid });
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
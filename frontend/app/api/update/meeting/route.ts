import { Meeting, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars } from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
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
        const host = await resolveZoomHost(newMeeting, { excludeMid: mid });
        if (!host) {
          zoomSynced = false;
          zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
        } else {
          const created = await createZoomMeeting(newMeeting, host);
          if (created) {
            zid = created.zid;
            zoomLink = created.zoomLink;
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

    await prisma.meeting.update({
      where: { mid },
      data: {
        zid, zoomLink, zoomHost, zoomCalendarEventId,
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

    const updatedMeeting = await prisma.meeting.update({
      where: {
        mid: mid,
      },
      data: {
        ...meetingFields,
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
    after(syncUpdatedMeeting(mid, newMeeting, existingMeeting, auth.accessToken));

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
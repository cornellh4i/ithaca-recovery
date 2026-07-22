import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars } from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, zoomRoomCalendarId } from "../../../../services/zoom";
import { prisma } from "../../../../lib/prisma";

const updateMeeting = async (request: Request): Promise<Response> => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const newMeeting = await request.json() as IMeeting;

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
    

    // Google Calendar sync — failure updates syncStatus but does not fail the request
    if (auth.accessToken && newMeeting.status !== 'Suspended') {
      const existingEventIds = (existingMeeting.googleCalendarEventIds ?? {}) as Record<string, string>;
      const { updatedEventIds, allSynced } = await reconcileMeetingCalendars(
        auth.accessToken,
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

    // Zoom sync — independent from Google Calendar sync above (own status field).
    if (newMeeting.status !== 'Suspended') {
      const oldZoomRoom = existingMeeting.zoomRoom;
      const newZoomRoom = newMeeting.zoomRoom;
      let zid = existingMeeting.zid;
      let zoomLink = existingMeeting.zoomLink;
      let zoomCalendarEventId = existingMeeting.zoomCalendarEventId;
      let zoomSynced = true;

      // Room changed or cleared — a Zoom meeting can't move rooms, so tear down and recreate.
      if (oldZoomRoom && oldZoomRoom !== newZoomRoom) {
        if (zid) {
          const ok = await deleteZoomMeeting(zid);
          if (!ok) zoomSynced = false;
        }
        if (auth.accessToken && zoomCalendarEventId) {
          const oldCalId = zoomRoomCalendarId[oldZoomRoom];
          if (oldCalId) {
            const ok = await deleteCalendarEvent(auth.accessToken, zoomCalendarEventId, oldCalId);
            if (!ok) zoomSynced = false;
          }
        }
        zid = null;
        zoomLink = null;
        zoomCalendarEventId = null;
      }

      if (newZoomRoom) {
        const sameRoomExisting = zid && oldZoomRoom === newZoomRoom;
        if (sameRoomExisting) {
          const ok = await updateZoomMeeting(zid as string, newMeeting);
          if (!ok) zoomSynced = false;
        } else if (!zid) {
          const created = await createZoomMeeting(newMeeting, newZoomRoom);
          if (created) {
            zid = created.zid;
            zoomLink = created.zoomLink;
          } else {
            zoomSynced = false;
          }
        }

        if (auth.accessToken && zoomLink) {
          const calId = zoomRoomCalendarId[newZoomRoom];
          if (calId) {
            const meetingWithZoomLink = { ...newMeeting, zoomLink };
            if (zoomCalendarEventId && sameRoomExisting) {
              const ok = await updateCalendarEvent(auth.accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink);
              if (!ok) zoomSynced = false;
            } else {
              const eventId = await createCalendarEvent(auth.accessToken, meetingWithZoomLink, calId, zoomLink);
              if (eventId) zoomCalendarEventId = eventId;
              else zoomSynced = false;
            }
          }
        }
      }

      await prisma.meeting.update({
        where: { mid },
        data: { zid, zoomLink, zoomCalendarEventId, zoomSyncStatus: zoomSynced ? 'synced' : 'error' },
      });
    }

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
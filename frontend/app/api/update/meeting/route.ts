import { PrismaClient, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../util/models";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, calendarIdsForMeeting, calendarIdForCategory } from "../../../../services/googleCalendar";

const prisma = new PrismaClient();

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
      const calendarIds = calendarIdsForMeeting(newMeeting.calType ?? []);
      const existingEventIds = (existingMeeting.googleCalendarEventIds ?? {}) as Record<string, string>;
      const updatedEventIds: Record<string, string> = { ...existingEventIds };
      let allSynced = true;

      // Remove events from calendars whose category is no longer part of this meeting's calType
      for (const cat of Object.keys(existingEventIds)) {
        if (calendarIds[cat]) continue;
        const calId = calendarIdForCategory[cat];
        const eventId = existingEventIds[cat];
        if (calId && eventId) {
          const ok = await deleteCalendarEvent(auth.accessToken, eventId, calId);
          if (!ok) allSynced = false;
        }
        delete updatedEventIds[cat];
      }

      for (const [cat, calId] of Object.entries(calendarIds)) {
        const existingId = existingEventIds[cat];
        if (existingId) {
          const ok = await updateCalendarEvent(auth.accessToken, existingId, newMeeting, calId);
          if (!ok) allSynced = false;
        } else {
          const newId = await createCalendarEvent(auth.accessToken, newMeeting, calId);
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
    }

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
import { IMeeting } from '../../../../util/models';
import { PrismaClient, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { createCalendarEvent, calendarIdsForMeeting } from "../../../../services/googleCalendar";
import { createZoomMeeting, zoomRoomCalendarId } from "../../../../services/zoom";

const prisma = new PrismaClient();

const createMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const meetingData = await request.json() as IMeeting;

    const { recurrencePattern, ...meetingDetails } = meetingData;

    const newMeeting = await prisma.meeting.create({
      data: {
        ...meetingDetails,
        isRecurring: !!recurrencePattern
      }
    });

    let responseMeeting: object = newMeeting;

    if (recurrencePattern) {
      let calculatedEndDate = recurrencePattern.endDate;

      if (recurrencePattern.numberOfOccurrences && !recurrencePattern.endDate) {
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

      await prisma.recurrencePattern.create({
        data: {
          mid: newMeeting.mid,
          type: recurrencePattern.type,
          startDate: recurrencePattern.startDate,
          endDate: calculatedEndDate,
          numberOfOccurrences: recurrencePattern.numberOfOccurrences,
          daysOfWeek: recurrencePattern.daysOfWeek || [],
          firstDayOfWeek: recurrencePattern.firstDayOfWeek || "Sunday",
          interval: recurrencePattern.interval || 1,
          weekOfMonth: recurrencePattern.weekOfMonth ?? null,
          dayOfMonth: recurrencePattern.dayOfMonth ?? null,
        }
      });

      const meetingWithRecurrence = await prisma.meeting.findUnique({
        where: { id: newMeeting.id },
        include: { recurrencePattern: true }
      });

      responseMeeting = meetingWithRecurrence ?? newMeeting;
    }

    // Google Calendar sync — non-blocking: failure sets syncStatus but does not fail the request
    if (auth.accessToken && meetingData.status !== 'Suspended') {
      const meetingForCalendar: IMeeting = { ...meetingData, isRecurring: !!recurrencePattern };
      const calendarIds = calendarIdsForMeeting(meetingData.calType ?? []);
      const eventIds: Record<string, string> = {};
      for (const [cat, calId] of Object.entries(calendarIds)) {
        const id = await createCalendarEvent(auth.accessToken, meetingForCalendar, calId);
        if (id) eventIds[cat] = id;
      }
      const synced = Object.keys(eventIds).length === Object.keys(calendarIds).length && Object.keys(calendarIds).length > 0;
      await prisma.meeting.update({
        where: { mid: newMeeting.mid },
        data: {
          googleCalendarEventIds: eventIds,
          syncStatus: synced ? 'synced' : 'error',
        },
      });
    }

    // Zoom sync — independent from Google Calendar sync above (own status field).
    // Skips the Zoom API call if zid/zoomLink already came in on the payload (import/manual).
    if (meetingData.zoomRoom && meetingData.status !== 'Suspended') {
      const meetingForZoom: IMeeting = { ...meetingData, isRecurring: !!recurrencePattern };
      let zid = meetingData.zid ?? null;
      let zoomLink = meetingData.zoomLink ?? null;
      let zoomCalendarEventId: string | null = null;
      let zoomSynced = true;

      if (!zid && !zoomLink) {
        const created = await createZoomMeeting(meetingForZoom, meetingData.zoomRoom);
        if (created) {
          zid = created.zid;
          zoomLink = created.zoomLink;
        } else {
          zoomSynced = false;
        }
      }

      if (auth.accessToken && zoomLink) {
        const calId = zoomRoomCalendarId[meetingData.zoomRoom];
        if (calId) {
          const eventId = await createCalendarEvent(auth.accessToken, { ...meetingForZoom, zoomLink }, calId, zoomLink);
          if (eventId) zoomCalendarEventId = eventId;
          else zoomSynced = false;
        }
      }

      await prisma.meeting.update({
        where: { mid: newMeeting.mid },
        data: { zid, zoomLink, zoomCalendarEventId, zoomSyncStatus: zoomSynced ? 'synced' : 'error' },
      });
    }

    return new Response(JSON.stringify(responseMeeting), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

/**
 * Calculate the end date based on a specific number of occurrences
 */
function calculateEndDateFromOccurrences(
  startDate: Date,
  daysOfWeek: string[],
  numberOfOccurrences: number,
  interval: number,
  type: string = "weekly",
  weekOfMonth: number | null = null,
  dayOfMonth: number | null = null,
): Date {
  const patternStartDate = new Date(startDate);

  if (numberOfOccurrences <= 0) return patternStartDate;

  const dayNameToIndex: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6,
  };

  if (type === "monthly") {
    // The Nth occurrence is (N-1) intervals after the start month
    const rawMonth = patternStartDate.getUTCMonth() + (numberOfOccurrences - 1) * interval;
    const targetYear = patternStartDate.getUTCFullYear() + Math.floor(rawMonth / 12);
    const targetMonth = rawMonth % 12;

    if (dayOfMonth != null) {
      return new Date(Date.UTC(targetYear, targetMonth, dayOfMonth));
    }

    if (weekOfMonth != null && daysOfWeek.length > 0) {
      const targetDay = dayNameToIndex[daysOfWeek[0]];
      const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

      if (weekOfMonth === -1) {
        for (let d = daysInMonth; d >= 1; d--) {
          if (new Date(Date.UTC(targetYear, targetMonth, d)).getUTCDay() === targetDay) {
            return new Date(Date.UTC(targetYear, targetMonth, d));
          }
        }
      } else {
        let count = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          if (new Date(Date.UTC(targetYear, targetMonth, d)).getUTCDay() === targetDay) {
            if (++count === weekOfMonth) {
              return new Date(Date.UTC(targetYear, targetMonth, d));
            }
          }
        }
      }
    }

    return new Date(Date.UTC(targetYear, targetMonth, patternStartDate.getUTCDate()));
  }

  // Weekly
  if (daysOfWeek.length === 0) return patternStartDate;

  const recurrenceDays = daysOfWeek
    .map(day => dayNameToIndex[day])
    .filter(index => index !== undefined)
    .sort((a, b) => a - b);

  if (recurrenceDays.length === 0) return patternStartDate;

  const endDate = new Date(patternStartDate);
  let occurrenceCount = 0;
  let currentWeek = 0;
  const startDayOfWeek = patternStartDate.getUTCDay();

  // The start date only counts as an occurrence if its weekday is in daysOfWeek.
  if (recurrenceDays.includes(startDayOfWeek)) {
    occurrenceCount++;
    if (occurrenceCount >= numberOfOccurrences) return patternStartDate;
  }

  let nextDayIndex = recurrenceDays.findIndex(day => day > startDayOfWeek);
  if (nextDayIndex === -1) { nextDayIndex = 0; currentWeek++; }

  while (occurrenceCount < numberOfOccurrences) {
    if (currentWeek % interval === 0) {
      while (nextDayIndex < recurrenceDays.length) {
        const daysToAdd = (currentWeek * 7) +
          (recurrenceDays[nextDayIndex] - startDayOfWeek + 7) % 7;
        endDate.setUTCDate(patternStartDate.getUTCDate() + daysToAdd);
        occurrenceCount++;
        nextDayIndex++;
        if (occurrenceCount >= numberOfOccurrences) return endDate;
      }
    }
    currentWeek++;
    nextDayIndex = 0;
  }

  return endDate;
}

export { createMeeting as POST };

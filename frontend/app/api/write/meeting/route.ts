import { IMeeting } from '../../../../util/models';
import { Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { createCalendarEvent, calendarIdsForMeeting } from "../../../../services/googleCalendar";
import { createZoomMeeting, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
import { convertETToUTC } from "../../../../util/timeUtils";
import { meetingSchema } from "../../../../util/meetingValidation";
import { prisma } from "../../../../lib/prisma";

// Runs after the response is sent (see after() call below) — failure sets syncStatus but
// does not fail the request, which has already returned by the time this runs. `resolvedHost`
// was already resolved (and persisted) synchronously in createMeeting, before this ever runs —
// see the comment there for why. This only does the network-bound half: actually creating the
// Zoom meeting under that host.
async function syncNewMeeting(
  mid: string,
  meetingData: IMeeting,
  isRecurring: boolean,
  accessToken: string | undefined,
  resolvedHost: string | null,
): Promise<void> {
  const meetingForSync: IMeeting = { ...meetingData, isRecurring };

  if (accessToken && meetingData.status !== 'Suspended') {
    const calendarIds = calendarIdsForMeeting(meetingData.calType ?? []);
    const eventIds: Record<string, string> = {};
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const id = await createCalendarEvent(accessToken, meetingForSync, calId);
      if (id) eventIds[cat] = id;
    }
    const synced = Object.keys(eventIds).length === Object.keys(calendarIds).length && Object.keys(calendarIds).length > 0;
    await prisma.meeting.update({
      where: { mid },
      data: {
        googleCalendarEventIds: eventIds,
        syncStatus: synced ? 'synced' : 'error',
      },
    });
  }

  if (meetingData.zoomRoom && meetingData.status !== 'Suspended') {
    let zid = meetingData.zid ?? null;
    let zoomLink = meetingData.zoomLink ?? null;
    const zoomHost = resolvedHost;
    let zoomCalendarEventId: string | null = null;
    let zoomSynced = true;
    let zoomSyncError: string | null = null;

    if (!zid && !zoomLink) {
      if (!zoomHost) {
        zoomSynced = false;
        zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
      } else {
        const created = await createZoomMeeting(meetingForSync, zoomHost);
        if (created) {
          zid = created.zid;
          zoomLink = created.zoomLink;
        } else {
          zoomSynced = false;
          zoomSyncError = "Failed to create the Zoom meeting.";
        }
      }
    }

    if (accessToken && zoomLink) {
      const calId = zoomRoomCalendarId[meetingData.zoomRoom];
      if (calId) {
        const eventId = await createCalendarEvent(accessToken, { ...meetingForSync, zoomLink }, calId, zoomLink);
        if (eventId) zoomCalendarEventId = eventId;
        else {
          zoomSynced = false;
          zoomSyncError = zoomSyncError ?? "Zoom meeting created but its calendar event failed to sync.";
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

const createMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const parsed = meetingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid meeting data", issues: parsed.error.issues }, { status: 400 });
    }
    const meetingData = parsed.data as IMeeting;

    const { recurrencePattern, ...meetingDetails } = meetingData;
    const isRecurring = !!recurrencePattern;

    let resolvedHost: string | null = null;
    let zoomSyncError: string | null = null;
    if (meetingData.zoomRoom && meetingData.status !== 'Suspended' && !meetingData.zid && !meetingData.zoomLink) {
      resolvedHost = await resolveZoomHost({ ...meetingData, isRecurring }, { excludeMid: meetingData.mid });
      if (!resolvedHost) {
        zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
      }
    }

    const newMeeting = await prisma.meeting.create({
      data: {
        ...meetingDetails,
        isRecurring,
        zoomHost: resolvedHost,
        ...(zoomSyncError ? { zoomSyncStatus: 'error', zoomSyncError } : {}),
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

    // GCal/Zoom sync runs after the response is sent — see syncNewMeeting above.
    after(syncNewMeeting(newMeeting.mid, meetingData, isRecurring, auth.accessToken, resolvedHost));

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
  type: string,
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

    // 23:59:59 ET so the end date is inclusive of its full day
    // even against a naive instant comparison (e.g. `meetingStart <= endDate`).
    const toETDate = (day: number) => new Date(convertETToUTC(
      `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59`
    ));

    if (dayOfMonth != null) {
      return toETDate(dayOfMonth);
    }

    if (weekOfMonth != null && daysOfWeek.length > 0) {
      const targetDay = dayNameToIndex[daysOfWeek[0]];
      const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

      if (weekOfMonth === -1) {
        for (let d = daysInMonth; d >= 1; d--) {
          if (new Date(Date.UTC(targetYear, targetMonth, d)).getUTCDay() === targetDay) {
            return toETDate(d);
          }
        }
      } else {
        let count = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          if (new Date(Date.UTC(targetYear, targetMonth, d)).getUTCDay() === targetDay) {
            if (++count === weekOfMonth) {
              return toETDate(d);
            }
          }
        }
      }
    }

    return toETDate(patternStartDate.getUTCDate());
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

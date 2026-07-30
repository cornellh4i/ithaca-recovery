import { IMeeting } from '../../../../util/models';
import { Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { createCalendarEvent, calendarIdsForMeeting } from "../../../../services/googleCalendar";
import { createZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
import { convertETToUTC } from "../../../../util/timeUtils";
import { meetingSchema } from "../../../../util/meetingValidation";
import { prisma } from "../../../../lib/prisma";

// Runs after the response is sent (see after() call below) — failure sets syncStatus but
// does not fail the request, which has already returned by the time this runs. `resolvedHost`
// was already resolved (and persisted) synchronously in createMeeting, before this ever runs —
// see the comment there for why.
//
// Zoom resolves/creates FIRST, before the main calType-calendar publish -- two reasons, not
// just one: (1) so the calType events actually carry the real zoomLink (services/
// googleCalendar.ts's buildEventBody already writes "Zoom: {link}" into the description
// whenever it's present; previously this loop ran first, so it never had one), and (2) so a
// meeting that needs Zoom but doesn't have a working one yet (host pool exhausted, or the
// Zoom API call failed) can skip the calendar publish entirely this run rather than
// publishing "fully scheduled" with a missing link -- a later "Retry sync"
// (update/meeting/sync/route.ts) picks this back up once a host becomes available.
async function syncNewMeeting(
  mid: string,
  meetingData: IMeeting,
  isRecurring: boolean,
  accessToken: string | undefined,
  resolvedHost: string | null,
): Promise<void> {
  if (meetingData.status === 'Suspended') return;

  const zoomEnabled = meetingData.modeType === 'Hybrid' || meetingData.modeType === 'Remote';

  let zid = meetingData.zid ?? null;
  let zoomLink = meetingData.zoomLink ?? null;
  let zoomPasscode = meetingData.zoomPasscode ?? null;
  const zoomHost = resolvedHost;
  let zoomCalendarEventId: string | null = null;
  let zoomSynced = true;
  let zoomSyncError: string | null = null;

  if (zoomEnabled && !zid && !zoomLink) {
    if (!zoomHost) {
      zoomSynced = false;
      zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
    } else {
      const created = await createZoomMeeting({ ...meetingData, isRecurring }, zoomHost);
      if (created) {
        zid = created.zid;
        zoomLink = created.zoomLink;
        zoomPasscode = created.zoomPasscode;
      } else {
        zoomSynced = false;
        zoomSyncError = "Failed to create the Zoom meeting.";
      }
    }
  }

  // True when this meeting needs Zoom but doesn't have a working Zoom meeting after the
  // attempt above -- the calendar publish below is deferred, not attempted with a missing link.
  // Matches the creation gate above (!zid && !zoomLink), not just !zid -- a payload that
  // already carried a zoomLink (no zid) skips creation at that gate and would otherwise be
  // misclassified as blocking despite already having a working link to publish.
  const zoomBlocking = zoomEnabled && !zid && !zoomLink;
  const meetingForSync: IMeeting = { ...meetingData, isRecurring, zoomLink };

  if (zoomBlocking) {
    await prisma.meeting.update({ where: { mid }, data: { syncStatus: 'pending' } });
  } else if (accessToken) {
    const requestedCalTypes = meetingData.calType ?? [];
    const calendarIds = calendarIdsForMeeting(requestedCalTypes);
    const eventIds: Record<string, string> = {};
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const id = await createCalendarEvent(accessToken, meetingForSync, calId);
      if (id) eventIds[cat] = id;
    }
    // Checked against requestedCalTypes, not calendarIds -- a category missing from calendarIds
    // (its GOOGLE_CALENDAR_* env var isn't configured) must still count against `synced`, same
    // as one whose event failed to create. Comparing against calendarIds alone would silently
    // report success whenever some (or all) requested categories never even attempted to sync.
    const synced = requestedCalTypes.length > 0 && requestedCalTypes.every((cat) => eventIds[cat]);
    await prisma.meeting.update({
      where: { mid },
      data: {
        googleCalendarEventIds: eventIds,
        syncStatus: synced ? 'synced' : 'error',
      },
    });
  }

  if (zoomEnabled) {
    const zoomInvitation = zid ? await getZoomMeetingInvitation(zid) : null;

    // Only Hybrid meetings have a zoomRoom -- Remote's dedicated per-room Zoom-Room calendar
    // publish naturally no-ops here (zoomRoomCalendarId[""] is undefined); its Zoom link is
    // carried by the main calType-calendar event above instead.
    if (accessToken && zoomLink && meetingData.zoomRoom) {
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
        zid, zoomLink, zoomPasscode, zoomInvitation, zoomHost, zoomCalendarEventId,
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

    const zoomEnabled = (meetingData.modeType === 'Hybrid' || meetingData.modeType === 'Remote')
      && meetingData.status !== 'Suspended';

    let resolvedHost: string | null = null;
    let zoomSyncError: string | null = null;
    if (zoomEnabled && !meetingData.zid && !meetingData.zoomLink) {
      // A manually-selected host (see the Meeting Form's Zoom Host dropdown) is used as-is,
      // no server-side conflict re-check -- the form's own "Check host availability" already
      // surfaced any conflict, and manual selection is explicitly for admin overrides.
      resolvedHost = meetingData.zoomHost
        || (await resolveZoomHost({ ...meetingData, isRecurring }, { excludeMid: meetingData.mid }));
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

import { IMeeting } from '../../../../util/models';
import { Meeting, Prisma, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { createCalendarEvent, calendarIdsForMeeting } from "../../../../services/googleCalendar";
import { createZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, findResourceConflictRows, ConflictRow } from "../../../../util/resourceOverlap";
import { meetingSchema } from "../../../../util/meetingValidation";
import { calculateEndDateFromOccurrences } from "../../../../util/meetingOccurrences";
import { prisma } from "../../../../lib/prisma";

// Runs after the response is sent (see after() call below) — failure sets googleSyncStatus but
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
  // The specific reason resolvedHost is null (pool exhausted vs. a manually-picked host that
  // conflicts) -- computed synchronously in createMeeting, before this ever runs. Without this,
  // both reasons collapsed to the same generic "pool exhausted" message below.
  hostSyncError: string | null,
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
      zoomSyncError = hostSyncError ?? "No Zoom host available for this meeting's schedule (pool exhausted).";
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
    await prisma.meeting.update({ where: { mid }, data: { googleSyncStatus: 'pending' } });
  } else if (accessToken) {
    const requestedCalTypes = meetingData.calType ?? [];
    const calendarIds = calendarIdsForMeeting(requestedCalTypes);
    const eventIds: Record<string, string> = {};
    // A category missing from calendarIds never gets visited by the loop below, so without
    // this its GOOGLE_CALENDAR_* misconfiguration would count against `synced` (see the
    // comment below) but leave googleSyncError null -- an "error" status with no error text.
    const unconfiguredCat = requestedCalTypes.find((cat) => !calendarIds[cat]);
    let googleSyncError: string | null = unconfiguredCat
      ? `Calendar for "${unconfiguredCat}" is not configured.`
      : null;
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const { id, error } = await createCalendarEvent(accessToken, meetingForSync, calId);
      if (id) eventIds[cat] = id;
      else googleSyncError = googleSyncError ?? error;
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
        googleSyncStatus: synced ? 'synced' : 'error',
        googleSyncError: synced ? null : googleSyncError,
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
        const { id: eventId, error } = await createCalendarEvent(accessToken, { ...meetingForSync, zoomLink }, calId, zoomLink);
        if (eventId) zoomCalendarEventId = eventId;
        else {
          zoomSynced = false;
          zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting created but its calendar event failed to sync.";
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

    const { recurrencePattern, confirmOverride, ...meetingDetails } = meetingData;
    const isRecurring = !!recurrencePattern;

    // Resolved once, up front, so the conflict check below and the eventual RecurrencePattern
    // write use the same finite endpoint -- a count-bounded series (numberOfOccurrences set, no
    // explicit endDate) has a real last occurrence, and checking conflicts against the raw
    // (still-null) endDate would expand it out to the full OVERLAP_HORIZON_YEARS window instead,
    // risking a false 409 against an unrelated booking that falls after the series actually ends.
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

    // Blocks the save outright on a room/zoomRoom collision, or a manually-picked zoomHost
    // (Zoom Host dropdown set to a specific host, not "Automatic") colliding with another
    // meeting's -- distinct from the pool-auto-assignment path below, which defers the calendar
    // publish and stores the error on the meeting instead of rejecting the request (there's no
    // "other host to pick instead" for a plain pool-exhaustion the way there is for a room or an
    // explicit host choice). confirmOverride only bypasses this block, not the pool's handling.
    if (!confirmOverride) {
      const candidate = {
        ...meetingData,
        isRecurring,
        recurrencePattern: recurrencePattern ? { ...recurrencePattern, endDate: calculatedEndDate } : null,
      };
      const conflictRows: ConflictRow[] = [];
      if (meetingData.room) {
        conflictRows.push(...await findResourceConflictRows("room", meetingData.room, candidate, prisma, { excludeMid: meetingData.mid }));
      }
      if (meetingData.zoomRoom) {
        conflictRows.push(...await findResourceConflictRows("zoomRoom", meetingData.zoomRoom, candidate, prisma, { excludeMid: meetingData.mid }));
      }
      if (meetingData.zoomHost) {
        conflictRows.push(...await findResourceConflictRows(
          "zoomHost", meetingData.zoomHost, candidate, prisma, { excludeMid: meetingData.mid, includeSuspended: true },
        ));
      }
      if (conflictRows.length > 0) {
        return NextResponse.json(
          { error: "This meeting conflicts with an existing meeting's room, Zoom room, or Zoom host.", conflicts: conflictRows },
          { status: 409 },
        );
      }
    }

    const zoomEnabled = (meetingData.modeType === 'Hybrid' || meetingData.modeType === 'Remote')
      && meetingData.status !== 'Suspended';

    let resolvedHost: string | null = null;
    let zoomSyncError: string | null = null;
    // The specific pool host an explicit pick collided with (kept even though resolvedHost
    // stays null) -- see the attemptedZoomHost field comment in schema.prisma for why.
    let attemptedZoomHost: string | null = null;
    if (zoomEnabled && !meetingData.zid && !meetingData.zoomLink) {
      if (meetingData.zoomHost) {
        // A conflicting manually-selected host is already blocked with a 409 above unless
        // confirmOverride was set -- reaching here with a real conflict only happens after that
        // override, or if availability shifted between the form's own "Check host availability"
        // and submission. Either way, nothing gets written to the external Zoom API (Zoom itself
        // has no concept of "double-book this host anyway" the way a room label does), and the
        // calendar publish is deferred (see zoomBlocking in syncNewMeeting) until an admin picks
        // a different host or the conflict clears.
        const conflicts = await findResourceConflicts(
          "zoomHost", meetingData.zoomHost, { ...meetingData, isRecurring }, prisma, { excludeMid: meetingData.mid, includeSuspended: true },
        );
        if (conflicts.length === 0) {
          resolvedHost = meetingData.zoomHost;
        } else {
          zoomSyncError = "This time conflicts with another meeting using the same Zoom host.";
          attemptedZoomHost = meetingData.zoomHost;
        }
      } else {
        resolvedHost = await resolveZoomHost({ ...meetingData, isRecurring }, { excludeMid: meetingData.mid });
        if (!resolvedHost) {
          zoomSyncError = "No Zoom host available for this meeting's schedule (pool exhausted).";
        }
      }
    }

    const meetingCreateData = {
      ...meetingDetails,
      // Postgres' Json columns reject a literal `null` on write (needs the Prisma.DbNull
      // sentinel for a real SQL NULL) -- Mongo's connector accepted plain `null` here directly.
      googleCalendarEventIds: meetingDetails.googleCalendarEventIds ?? Prisma.DbNull,
      isRecurring,
      zoomHost: resolvedHost,
      attemptedZoomHost,
      ...(zoomSyncError ? { zoomSyncStatus: 'error', zoomSyncError } : {}),
    };

    let newMeeting: Meeting;
    let responseMeeting: object;

    if (recurrencePattern) {
      // meetingDetails.mid is client-generated (see NewMeeting.tsx's uuidv4()) and known before
      // either write, so both creates can run as one atomic transaction instead of a create-then-
      // create sequence an interrupted request could leave half-done (a Meeting with
      // isRecurring: true and no RecurrencePattern row).
      const [createdMeeting, createdPattern] = await prisma.$transaction([
        prisma.meeting.create({ data: meetingCreateData }),
        prisma.recurrencePattern.create({
          data: {
            mid: meetingDetails.mid,
            type: recurrencePattern.type,
            startDate: recurrencePattern.startDate,
            endDate: calculatedEndDate,
            numberOfOccurrences: recurrencePattern.numberOfOccurrences,
            daysOfWeek: recurrencePattern.daysOfWeek || [],
            firstDayOfWeek: recurrencePattern.firstDayOfWeek || "Sunday",
            interval: recurrencePattern.interval || 1,
            weekOfMonth: recurrencePattern.weekOfMonth ?? null,
            dayOfMonth: recurrencePattern.dayOfMonth ?? null,
          },
        }),
      ]);

      newMeeting = createdMeeting;
      responseMeeting = { ...createdMeeting, recurrencePattern: createdPattern };
    } else {
      newMeeting = await prisma.meeting.create({ data: meetingCreateData });
      responseMeeting = newMeeting;
    }

    // GCal/Zoom sync runs after the response is sent — see syncNewMeeting above.
    after(syncNewMeeting(newMeeting.mid, meetingData, isRecurring, auth.accessToken, resolvedHost, zoomSyncError));

    return new Response(JSON.stringify(responseMeeting), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { createMeeting as POST };

import { IMeeting } from '../../../../types/models';
import { Meeting, Prisma, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { createCalendarEvent, calendarIdsForMeeting } from "../../../../services/googleCalendar";
import { createZoomMeeting, getZoomMeetingInvitation, resolveZoomHost, zoomHostPool, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, findResourceConflictRows, ConflictRow, ResourceConflictAbort } from "../../../../util/meetings/resourceOverlap";
import { lockResourceClaims, ResourceClaim } from "../../../../util/meetings/resourceLocks";
import { meetingSchema } from "../../../../util/meetings/meetingValidation";
import { calculateEndDateFromOccurrences } from "../../../../util/meetings/meetingOccurrences";
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

  // Accumulated instead of written immediately -- these used to be two separate
  // prisma.meeting.update calls (this block, then the zoom block below), leaving a real window
  // where a poller could observe googleSyncStatus turn non-null before the zid/zoomHost write
  // landed. `undefined` here means "this run never touched this field," same as omitting it
  // from a Prisma update -- the single combined write below makes every field that *did* change
  // visible atomically, in one row version. googleSyncStatus itself is always assigned by one
  // of the three branches below (zoomBlocking/accessToken/no-token), unlike the other two.
  let googleCalendarEventIds: Record<string, string> | undefined;
  let googleSyncStatus: string | undefined;
  let googleSyncError: string | null | undefined;

  if (zoomBlocking) {
    googleSyncStatus = 'pending';
  } else if (accessToken) {
    const requestedCalTypes = meetingData.calType ?? [];
    const calendarIds = calendarIdsForMeeting(requestedCalTypes);
    const eventIds: Record<string, string> = {};
    // A category missing from calendarIds never gets visited by the loop below, so without
    // this its GOOGLE_CALENDAR_* misconfiguration would count against `synced` (see the
    // comment below) but leave the error null -- an "error" status with no error text.
    const unconfiguredCat = requestedCalTypes.find((cat) => !calendarIds[cat]);
    let syncError: string | null = unconfiguredCat
      ? `Calendar for "${unconfiguredCat}" is not configured.`
      : null;
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const { id, error } = await createCalendarEvent(accessToken, meetingForSync, calId);
      if (id) eventIds[cat] = id;
      else syncError = syncError ?? error;
    }
    // Checked against requestedCalTypes, not calendarIds -- a category missing from calendarIds
    // (its GOOGLE_CALENDAR_* env var isn't configured) must still count against `synced`, same
    // as one whose event failed to create. Comparing against calendarIds alone would silently
    // report success whenever some (or all) requested categories never even attempted to sync.
    const synced = requestedCalTypes.length > 0 && requestedCalTypes.every((cat) => eventIds[cat]);
    googleCalendarEventIds = eventIds;
    googleSyncStatus = synced ? 'synced' : 'error';
    googleSyncError = synced ? null : syncError;
  } else {
    // No accessToken and not zoomBlocking -- without this branch googleSyncStatus stays
    // `undefined` forever (never assigned, never persisted), and for a non-Zoom meeting the
    // write below is skipped entirely (see the `googleSyncStatus !== undefined` gate), leaving
    // the row at googleSyncStatus: null indefinitely with nothing surfacing the failure.
    googleSyncStatus = 'error';
    googleSyncError = "No Google Calendar access token available for this sync.";
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
        googleCalendarEventIds, googleSyncStatus, googleSyncError,
      },
    });
  } else {
    // googleSyncStatus is always assigned by this point (see the accumulator comment above),
    // so this write always has something to persist.
    await prisma.meeting.update({
      where: { mid },
      data: { googleCalendarEventIds, googleSyncStatus, googleSyncError },
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

    const zoomEnabled = (meetingData.modeType === 'Hybrid' || meetingData.modeType === 'Remote')
      && meetingData.status !== 'Suspended';

    // Built once, reused for every conflict/candidate check below (the blocking check, the
    // zoomHost re-check on override, and the pool-auto-assign call) -- endDate normalized to
    // calculatedEndDate so a count-bounded series (numberOfOccurrences set, no explicit endDate)
    // doesn't get expanded to the full OVERLAP_HORIZON_YEARS window by any of them.
    const candidate = {
      ...meetingData,
      isRecurring,
      recurrencePattern: recurrencePattern ? { ...recurrencePattern, endDate: calculatedEndDate } : null,
    };

    let resolvedHost: string | null = null;
    let zoomSyncError: string | null = null;

    // Pure/cheap (no DB) -- only decides which claims to lock below. The actual pool-host
    // resolution runs on `tx`, after every pool host is locked, inside the transaction (see the
    // zoomHost-resolution block further down): resolving before the lock, or on a connection the
    // lock isn't held on, is exactly the check-then-write race #360 closes -- two concurrent
    // auto-assign requests could otherwise both read the same last-free host before either
    // commits.
    const needsAutoHost = zoomEnabled && !meetingData.zid && !meetingData.zoomLink && !meetingData.zoomHost;

    // Everything from the conflict check through the Meeting(+RecurrencePattern) write runs
    // inside one transaction, guarded by a single lockResourceClaims call -- this is what closes
    // PR #303's accepted check-then-write race (two concurrent requests could both pass the
    // conflict check before either wrote, and both succeed) and #360's pool-auto-assignment gap
    // (every zoomHostPool candidate is locked here too, not just an explicit pick). Locks are
    // acquired unconditionally (confirmOverride or not) up front, before either the blocking
    // check below or the zoomHost-resolution block reads the same resources, so both read the
    // same lock-protected snapshot. Explicit timeout: with the whole pool now locked and resolved
    // in-transaction (previously a pre-transaction, unlocked step), lock-wait time under real
    // pool contention is no longer bounded by Prisma's 5s default the way a short, DB-only
    // transaction normally would be -- 10s is a conservative starting point pending the real
    // measurement in ithaca-recovery-zoom-host-pool-race-plan.md. maxWait raised alongside it for
    // the same reason: every concurrent auto-assign request now holds a pooled connection for its
    // full lock wait, so a burst of them can exhaust Prisma's default 2s connection-acquisition
    // budget before a queued request even starts waiting on the lock itself.
    let result: { createdMeeting: Meeting; createdPattern: Awaited<ReturnType<typeof prisma.recurrencePattern.create>> | null };
    try {
      result = await prisma.$transaction(async (tx) => {
        const claims: ResourceClaim[] = [];
        if (meetingData.room) claims.push({ type: "room", value: meetingData.room });
        if (meetingData.zoomRoom) claims.push({ type: "zoomRoom", value: meetingData.zoomRoom });
        if (meetingData.zoomHost) claims.push({ type: "zoomHost", value: meetingData.zoomHost });
        if (needsAutoHost) {
          for (const host of zoomHostPool) claims.push({ type: "zoomHost", value: host });
        }
        await lockResourceClaims(tx, claims);

        // Blocks the save outright on a room/zoomRoom collision, or a manually-picked zoomHost
        // (Zoom Host dropdown set to a specific host, not "Automatic") colliding with another
        // meeting's -- distinct from the pool-auto-assignment path above, which defers the
        // calendar publish and stores the error on the meeting instead of rejecting the request
        // (there's no "other host to pick instead" for a plain pool-exhaustion the way there is
        // for a room or an explicit host choice). confirmOverride only bypasses this block, not
        // the pool's handling.
        // Tracked separately from the combined conflictRows below: if this comes back empty,
        // the zoomHost-resolution block further down can skip re-querying the exact same
        // field/value/candidate it would otherwise redundantly check again.
        let zoomHostConflictRows: ConflictRow[] = [];
        if (!confirmOverride) {
          const conflictRows: ConflictRow[] = [];
          if (meetingData.room) {
            conflictRows.push(...await findResourceConflictRows("room", meetingData.room, candidate, tx, { excludeMid: meetingData.mid }));
          }
          if (meetingData.zoomRoom) {
            conflictRows.push(...await findResourceConflictRows("zoomRoom", meetingData.zoomRoom, candidate, tx, { excludeMid: meetingData.mid }));
          }
          if (meetingData.zoomHost) {
            zoomHostConflictRows = await findResourceConflictRows(
              "zoomHost", meetingData.zoomHost, candidate, tx, { excludeMid: meetingData.mid, includeSuspended: true },
            );
            conflictRows.push(...zoomHostConflictRows);
          }
          if (conflictRows.length > 0) {
            throw new ResourceConflictAbort(conflictRows);
          }
        }

        // The specific pool host an explicit pick collided with (kept even though resolvedHost
        // stays null) -- see the attemptedZoomHost field comment in schema.prisma for why.
        let attemptedZoomHost: string | null = null;
        if (zoomEnabled && !meetingData.zid && !meetingData.zoomLink) {
          if (meetingData.zoomHost) {
            // A conflicting manually-selected host is already blocked with a 409 above unless
            // confirmOverride was set. When !confirmOverride, the block above already proved
            // zoomHostConflictRows is empty (any conflict would have thrown) -- no need to
            // re-query the same field/value/candidate again. Only confirmOverride (which skips
            // the block entirely) needs a fresh check here.
            const conflicts = confirmOverride
              ? await findResourceConflicts(
                  "zoomHost", meetingData.zoomHost, candidate, tx, { excludeMid: meetingData.mid, includeSuspended: true },
                )
              : [];
            if (conflicts.length === 0 && zoomHostConflictRows.length === 0) {
              resolvedHost = meetingData.zoomHost;
            } else {
              zoomSyncError = "This time conflicts with another meeting using the same Zoom host.";
              attemptedZoomHost = meetingData.zoomHost;
            }
          } else {
            const poolResolvedHost = await resolveZoomHost(candidate, tx, { excludeMid: meetingData.mid });
            resolvedHost = poolResolvedHost;
            zoomSyncError = poolResolvedHost
              ? null
              : "No Zoom host available for this meeting's schedule (pool exhausted).";
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

        // meetingDetails.mid is client-generated (see NewMeeting.tsx's uuidv4()) and known
        // before either write, so both creates stay part of this same transaction instead of a
        // create-then-create sequence an interrupted request could leave half-done (a Meeting
        // with isRecurring: true and no RecurrencePattern row).
        const createdMeeting = await tx.meeting.create({ data: meetingCreateData });
        const createdPattern = recurrencePattern
          ? await tx.recurrencePattern.create({
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
            })
          : null;

        return { createdMeeting, createdPattern };
      }, { timeout: 10_000, maxWait: 10_000 });
    } catch (error) {
      if (error instanceof ResourceConflictAbort) {
        return NextResponse.json(
          { error: "This meeting conflicts with an existing meeting's room, Zoom room, or Zoom host.", conflicts: error.conflicts },
          { status: 409 },
        );
      }
      throw error;
    }

    const newMeeting = result.createdMeeting;
    const responseMeeting = result.createdPattern
      ? { ...newMeeting, recurrencePattern: result.createdPattern }
      : newMeeting;

    // GCal/Zoom sync runs after the response is sent — see syncNewMeeting above. Caught here so
    // a throw mid-sync (as opposed to a handled failure, which syncNewMeeting already persists
    // as an error status itself) doesn't vanish as a silent unhandled rejection, leaving the
    // meeting's sync status at whatever it was before this run.
    after(
      syncNewMeeting(newMeeting.mid, meetingData, isRecurring, auth.accessToken, resolvedHost, zoomSyncError)
        .catch(async (error) => {
          console.error("syncNewMeeting threw:", error);
          try {
            await prisma.meeting.update({
              where: { mid: newMeeting.mid },
              data: { googleSyncStatus: 'error', googleSyncError: "Sync job failed unexpectedly." },
            });
          } catch (persistError) {
            console.error("Failed to persist sync failure status:", persistError);
          }
        }),
    );

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

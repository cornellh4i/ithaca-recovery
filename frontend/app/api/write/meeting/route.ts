import { IMeeting } from '../../../../types/models';
import { Meeting, Prisma, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { createCalendarEvent, calendarIdsForMeeting } from "../../../../services/googleCalendar";
import { createZoomMeeting, getZoomHostCapacities, getZoomMeetingInvitation, resolveZoomHost, zoomHostPool, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, findResourceConflictRows, ConflictRow, ResourceConflictAbort } from "../../../../util/meetings/resourceOverlap";
import { lockResourceClaims, ResourceClaim } from "../../../../util/meetings/resourceLocks";
import { meetingSchema, linkedScheduleSchema, LinkedScheduleInput } from "../../../../util/meetings/meetingValidation";
import {
  linkedFamilyLoader, availableModesFor, claimedDaysFor, deriveLinkedScheduleStart, isZoomBearing,
} from "../../../../util/meetings/linkedSchedules";
import { isSharedZoomScheduleCompatible } from "../../../../util/meetings/sharedZoomSchedule";
import { isConvertETToUTCValidationError } from "../../../../util/date/timeUtils";
import { calculateEndDateFromOccurrences } from "../../../../util/meetings/meetingOccurrences";
import { prisma } from "../../../../lib/prisma";

// One schedule of the meeting being created, as the deferred sync below has to publish it. A
// plain create has exactly one of these; a create carrying a `linkedSchedule` block has two --
// the same meeting run as two weekly schedules, served by ONE Zoom meeting
// (util/meetings/linkedSchedules.ts).
type NewMeetingSyncRow = {
  mid: string;
  meeting: IMeeting;
  isRecurring: boolean;
  // Whether this row needs the family's Zoom meeting. An In-Person member is deliberately
  // Zoom-free: it holds no zid/zoomLink and its weekdays never reach Zoom's recurrence.
  zoomBearing: boolean;
};

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
//
// A family is served by ONE Zoom meeting: it is created once, from whichever row bears Zoom
// first (the anchor unless the anchor is In Person), and its identity is then fanned out to
// every Zoom-bearing row. Each row still publishes its OWN Google Calendar events -- same
// family, same union title, but its own dates, room and calendars.
async function syncNewMeeting(
  rows: NewMeetingSyncRow[],
  accessToken: string | undefined,
  resolvedHost: string | null,
  // The specific reason resolvedHost is null (pool exhausted vs. a manually-picked host that
  // conflicts) -- computed synchronously in createMeeting, before this ever runs. Without this,
  // both reasons collapsed to the same generic "pool exhausted" message below.
  hostSyncError: string | null,
): Promise<void> {
  const [primary] = rows;
  if (primary.meeting.status === 'Suspended') return;

  // One family lookup for this whole sync, shared by the Zoom create and every calendar publish
  // below -- the family names the Zoom meeting and each member's calendar event alike, so a
  // second lookup could only disagree with the first.
  const loadFamily = linkedFamilyLoader(prisma, primary.mid);

  const zoomRows = rows.filter((row) => row.zoomBearing);
  // The row the family's single Zoom meeting is minted from: the anchor whenever it needs Zoom,
  // otherwise the linked schedule (an In-Person anchor has no Zoom meeting to give, so its
  // Zoom-bearing sibling becomes the family's zid holder -- which is exactly why the family is
  // keyed on linkedToMid rather than on zid).
  const mintingRow = zoomRows[0] ?? null;

  let zid = mintingRow?.meeting.zid ?? null;
  let zoomLink = mintingRow?.meeting.zoomLink ?? null;
  let zoomPasscode = mintingRow?.meeting.zoomPasscode ?? null;
  let zoomInvitation: string | null = null;
  let zoomSynced = true;
  let zoomSyncError: string | null = null;

  if (mintingRow && !zid && !zoomLink) {
    if (!resolvedHost) {
      zoomSynced = false;
      zoomSyncError = hostSyncError ?? "No Zoom host available for this meeting's schedule (pool exhausted).";
    } else {
      // The rows are already committed by the time this runs, so the family lookup sees every
      // schedule this meeting was created with -- one Zoom meeting is minted for the whole
      // family, with its union schedule and its family Zoom name, never one per schedule.
      const family = await loadFamily(null);
      const created = await createZoomMeeting(
        { ...mintingRow.meeting, isRecurring: mintingRow.isRecurring }, resolvedHost, family,
      );
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

  if (zid || zoomLink) {
    zoomInvitation = zid ? await getZoomMeetingInvitation(zid) : null;
    // The Zoom identity is a family-wide set, fanned out to EVERY Zoom-bearing row rather than
    // to the minting row alone -- both schedules are the same one Zoom booking, and a row left
    // without the zid would look unprovisioned to Retry sync and mint a second meeting.
    // Written before the calendar publishes below, so a throw mid-publish can't strand a real
    // Zoom meeting with nothing in the database pointing at it.
    await prisma.meeting.updateMany({
      where: { mid: { in: zoomRows.map((row) => row.mid) } },
      data: { zid, zoomLink, zoomPasscode, zoomInvitation, zoomHost: resolvedHost },
    });
  }

  for (const row of rows) {
    // True when this row needs Zoom but doesn't have a working Zoom meeting after the attempt
    // above -- its calendar publish is deferred, not attempted with a missing link. Matches the
    // creation gate above (!zid && !zoomLink), not just !zid -- a payload that already carried a
    // zoomLink (no zid) skips creation at that gate and would otherwise be misclassified as
    // blocking despite already having a working link to publish.
    const zoomBlocking = row.zoomBearing && !zid && !zoomLink;
    const meetingForSync: IMeeting = {
      ...row.meeting,
      isRecurring: row.isRecurring,
      // Only a Zoom-bearing row carries the family's link: buildEventBody writes
      // "Zoom: {link}" into the description whenever one is present, and an In-Person schedule
      // must never advertise a join link -- including one the payload itself supplied, which is
      // why the else arm clears rather than omits.
      ...(row.zoomBearing
        ? { zid, zoomLink, zoomPasscode }
        : { zid: null, zoomLink: null, zoomPasscode: null, zoomInvitation: null }),
    };

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
      const requestedCalTypes = row.meeting.calType ?? [];
      const calendarIds = calendarIdsForMeeting(requestedCalTypes);
      const eventIds: Record<string, string> = {};
      // A category missing from calendarIds never gets visited by the loop below, so without
      // this its GOOGLE_CALENDAR_* misconfiguration would count against `synced` (see the
      // comment below) but leave the error null -- an "error" status with no error text.
      const unconfiguredCat = requestedCalTypes.find((cat) => !calendarIds[cat]);
      let syncError: string | null = unconfiguredCat
        ? `Calendar for "${unconfiguredCat}" is not configured.`
        : null;
      // The same family every other publish in this request gets -- so both schedules' events
      // are born with the family's union title, never their own lone-mode one.
      const family = await loadFamily(zid);
      for (const [cat, calId] of Object.entries(calendarIds)) {
        const { id, error } = await createCalendarEvent(accessToken, meetingForSync, calId, undefined, family);
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

    if (row.zoomBearing) {
      // The family's Zoom outcome is shared by every Zoom-bearing row; only the Zoom-Room
      // calendar event below is this row's own.
      let zoomCalendarEventId: string | null = null;
      let rowZoomSynced = zoomSynced;
      let rowZoomSyncError = zoomSyncError;

      // Only Hybrid meetings have a zoomRoom -- Remote's dedicated per-room Zoom-Room calendar
      // publish naturally no-ops here (zoomRoomCalendarId[""] is undefined); its Zoom link is
      // carried by the main calType-calendar event above instead.
      if (accessToken && zoomLink && row.meeting.zoomRoom) {
        const calId = zoomRoomCalendarId[row.meeting.zoomRoom];
        if (calId) {
          const { id: eventId, error } = await createCalendarEvent(
            accessToken, { ...meetingForSync, zoomLink }, calId, zoomLink, await loadFamily(zid),
          );
          if (eventId) zoomCalendarEventId = eventId;
          else {
            rowZoomSynced = false;
            rowZoomSyncError = rowZoomSyncError ?? error ?? "Zoom meeting created but its calendar event failed to sync.";
          }
        }
      }

      await prisma.meeting.update({
        where: { mid: row.mid },
        data: {
          zoomCalendarEventId,
          zoomSyncStatus: rowZoomSynced ? 'synced' : 'error',
          zoomSyncError: rowZoomSynced ? null : rowZoomSyncError,
          googleCalendarEventIds, googleSyncStatus, googleSyncError,
        },
      });
    } else {
      // googleSyncStatus is always assigned by this point (see the accumulator comment above),
      // so this write always has something to persist.
      await prisma.meeting.update({
        where: { mid: row.mid },
        data: { googleCalendarEventIds, googleSyncStatus, googleSyncError },
      });
    }
  }
}

// Everything the linked schedule's own Meeting + RecurrencePattern rows are written from, once
// the payload has been validated against the primary schedule it is derived from.
type LinkedSchedulePlan = {
  mid: string;
  modeType: string;
  room: string;
  zoomRoom: string | null;
  startDateTime: Date;
  endDateTime: Date;
  patternStartDate: Date;
  endDate: Date | null;
  numberOfOccurrences: number | null;
  daysOfWeek: string[];
  interval: number;
  firstDayOfWeek: string;
  zoomBearing: boolean;
  // The occurrence-expansion shape the conflict checks read.
  candidate: {
    mid: string;
    title: string;
    room: string;
    zoomRoom: string | null;
    zoomHost: string | null;
    status: string;
    calType: string[];
    startDateTime: Date;
    endDateTime: Date;
    isRecurring: boolean;
    recurrencePattern: {
      type: string; startDate: Date; endDate: Date | null; interval: number;
      daysOfWeek: string[]; weekOfMonth: number | null; dayOfMonth: number | null; excludedDates: Date[];
    };
  };
};

// Validates a `linkedSchedule` block against the primary schedule in the same payload and derives
// the second row's whole series from it. Mirrors handleLinkedScheduleCreate (update/meeting/
// route.ts), whose anchor is a stored row rather than the request's own primary schedule -- the
// rules are the same because the resulting families have to be: one Zoom meeting can only hold
// one series, so the two schedules may differ in mode, weekdays and rooms and in nothing else.
// Returns an error message for a 400, or the plan to write.
function planLinkedSchedule(
  meetingData: IMeeting,
  recurrencePattern: IMeeting['recurrencePattern'],
  calculatedEndDate: Date | null,
  linkedSchedule: LinkedScheduleInput,
): { error: string } | { plan: LinkedSchedulePlan } {
  if (!recurrencePattern) {
    return { error: "A linked schedule can only be added to a recurring meeting." };
  }
  if (recurrencePattern.type !== 'weekly') {
    return { error: "A linked schedule can only be added to a weekly meeting." };
  }
  // The primary schedule as the shared family predicates read it -- the family this request is
  // about to create is exactly {primary, linked}, so the same availableModesFor/claimedDaysFor
  // that gate an added schedule (and the form's mode/day locking) gate this one.
  const family = {
    anchor: { modeType: meetingData.modeType, recurrencePattern: { daysOfWeek: recurrencePattern.daysOfWeek ?? [] } },
    linked: [],
  };
  const availableModes = availableModesFor(family);
  if (!availableModes.includes(linkedSchedule.modeType)) {
    return { error: `A linked schedule must use a mode this meeting doesn't already run (${availableModes.join(", ")}).` };
  }
  const daysOfWeek = linkedSchedule.recurrencePattern.daysOfWeek ?? [];
  if (daysOfWeek.length === 0) {
    return { error: "A linked schedule must meet on at least one day of the week." };
  }
  // Disjoint weekdays are a hard requirement, not a preference: Zoom holds the family's schedules
  // as ONE union of weekdays, so a day claimed twice silently collapses into a single occurrence.
  const claimedDays = claimedDaysFor(family);
  const overlappingDays = daysOfWeek.filter((day) => claimedDays.includes(day));
  if (overlappingDays.length > 0) {
    return { error: `This meeting already meets on ${overlappingDays.join(", ")}; a linked schedule must run on other days.` };
  }

  const interval = recurrencePattern.interval || 1;
  let derived: ReturnType<typeof deriveLinkedScheduleStart>;
  try {
    derived = deriveLinkedScheduleStart(
      {
        startDateTime: new Date(meetingData.startDateTime),
        endDateTime: new Date(meetingData.endDateTime),
        // endDate normalized to calculatedEndDate, so a count-bounded primary schedule doesn't
        // look unbounded while the first linked occurrence is searched for.
        recurrencePattern: { startDate: new Date(recurrencePattern.startDate), endDate: calculatedEndDate, interval },
      },
      daysOfWeek,
    );
  } catch (error) {
    // The primary schedule's time of day doesn't exist on the linked schedule's first date (the
    // DST spring-forward gap) -- the admin's own input, not a server fault.
    if (isConvertETToUTCValidationError(error)) return { error: error.message };
    throw error;
  }
  if (!derived) {
    return { error: "The requested days produce no occurrence inside this meeting's series." };
  }
  const { startDateTime, endDateTime, patternStartDate } = derived;

  // Where the series ends is the primary schedule's to decide, never the linked block's: a
  // count-bounded meeting gives the linked schedule the same COUNT, resolved into its own end
  // date because its weekdays reach that count elsewhere. Counted from patternStartDate, not the
  // row's start instant -- see deriveLinkedScheduleStart.
  const numberOfOccurrences = recurrencePattern.endDate ? null : (recurrencePattern.numberOfOccurrences ?? null);
  const endDate = recurrencePattern.endDate
    ? new Date(recurrencePattern.endDate)
    : (numberOfOccurrences
      ? calculateEndDateFromOccurrences(patternStartDate, daysOfWeek, numberOfOccurrences, interval, 'weekly', null, null)
      : null);

  const plan: LinkedSchedulePlan = {
    mid: linkedSchedule.mid,
    modeType: linkedSchedule.modeType,
    room: linkedSchedule.room ?? "",
    zoomRoom: linkedSchedule.zoomRoom ?? null,
    startDateTime,
    endDateTime,
    patternStartDate,
    endDate,
    numberOfOccurrences,
    daysOfWeek,
    interval,
    firstDayOfWeek: recurrencePattern.firstDayOfWeek || "Sunday",
    zoomBearing: isZoomBearing({ modeType: linkedSchedule.modeType }),
    candidate: {
      mid: linkedSchedule.mid,
      title: meetingData.title,
      room: linkedSchedule.room ?? "",
      zoomRoom: linkedSchedule.zoomRoom ?? null,
      // Whatever host the family ends up on is resolved inside the write transaction; the
      // conflict checks read this candidate for its occurrences, never for its host.
      zoomHost: null,
      status: meetingData.status ?? 'Active',
      calType: meetingData.calType,
      startDateTime,
      endDateTime,
      isRecurring: true,
      recurrencePattern: {
        type: 'weekly', startDate: patternStartDate, endDate, interval,
        daysOfWeek, weekOfMonth: null, dayOfMonth: null, excludedDates: [],
      },
    },
  };

  // Backstop for a family Zoom couldn't hold as one series. Everything the check reads is derived
  // above, so a request that reaches here normally passes -- but a family it rejects would have
  // its Zoom schedule silently frozen from creation, which is worth refusing outright.
  const primaryRow = {
    isRecurring: true,
    startDateTime: new Date(meetingData.startDateTime),
    endDateTime: new Date(meetingData.endDateTime),
    recurrencePattern: { type: recurrencePattern.type, interval },
  };
  if (!isSharedZoomScheduleCompatible([primaryRow, { ...plan.candidate, recurrencePattern: { type: 'weekly', interval } }])) {
    return { error: "This meeting's schedules can't be served by one Zoom meeting (they must share an interval, time of day and duration)." };
  }

  return { plan };
}

const createMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const rawBody = await request.json();
    const parsed = meetingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid meeting data", issues: parsed.error.issues }, { status: 400 });
    }
    const meetingData = parsed.data as IMeeting;
    // The form doesn't collect a creator (it sends a placeholder) -- record the signed-in admin
    // who actually created the meeting, server-side, so the value can't be spoofed either.
    meetingData.creator = auth.user?.email ?? meetingData.creator;

    // Parsed separately from meetingSchema (see linkedScheduleBlockSchema's comment) -- present
    // only when the meeting is being created with a SECOND weekly schedule of its own.
    const linkedParsed = linkedScheduleSchema.safeParse(rawBody);
    if (!linkedParsed.success) {
      return NextResponse.json({ error: "Invalid linked schedule", issues: linkedParsed.error.issues }, { status: 400 });
    }
    const linkedSchedule: LinkedScheduleInput | null = linkedParsed.data.linkedSchedule ?? null;

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

    let linkedPlan: LinkedSchedulePlan | null = null;
    if (linkedSchedule) {
      const planned = planLinkedSchedule(meetingData, recurrencePattern ?? null, calculatedEndDate, linkedSchedule);
      if ('error' in planned) return NextResponse.json({ error: planned.error }, { status: 400 });
      linkedPlan = planned.plan;
    }

    // Zoom is provisioned for the FAMILY, not per row: a Hybrid/Remote schedule needs it whether
    // it is the primary schedule or the linked one, and either way there is exactly one Zoom
    // meeting, one host reservation, and one set of Zoom credentials.
    const primaryZoomBearing = isZoomBearing(meetingData) && meetingData.status !== 'Suspended';
    const linkedZoomBearing = !!linkedPlan?.zoomBearing && meetingData.status !== 'Suspended';
    const zoomEnabled = primaryZoomBearing || linkedZoomBearing;

    // Built once, reused for every conflict/candidate check below (the blocking check, the
    // zoomHost re-check on override, and the pool-auto-assign call) -- endDate normalized to
    // calculatedEndDate so a count-bounded series (numberOfOccurrences set, no explicit endDate)
    // doesn't get expanded to the full OVERLAP_HORIZON_YEARS window by any of them.
    const candidate = {
      ...meetingData,
      isRecurring,
      recurrencePattern: recurrencePattern ? { ...recurrencePattern, endDate: calculatedEndDate } : null,
    };

    // The host is booked ONCE for the whole family, so it is checked against everything that one
    // Zoom booking has to cover: the union of the Zoom-bearing schedules' weekdays, at the time
    // of day and duration they share (isSharedZoomScheduleCompatible, enforced above). Checking
    // the two rows separately would instead count the family's single booking twice against the
    // host's capacity. Identical to `candidate` whenever there is no linked schedule.
    const zoomCandidate = (() => {
      if (!linkedPlan || !linkedZoomBearing) return candidate;
      // An In-Person primary schedule holds no Zoom booking at all -- the linked schedule's own
      // occurrences are the whole of what the family's Zoom meeting covers.
      if (!primaryZoomBearing) return linkedPlan.candidate;
      if (!candidate.recurrencePattern) return candidate;
      const unionDays = [...new Set([
        ...(candidate.recurrencePattern.daysOfWeek ?? []),
        ...linkedPlan.daysOfWeek,
      ])];
      return { ...candidate, recurrencePattern: { ...candidate.recurrencePattern, daysOfWeek: unionDays } };
    })();

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
    // License-dependent per-host capacities, resolved BEFORE the locked transaction below — a
    // Zoom API round trip while pool advisory locks are held would extend lock hold time by an
    // external call's latency (cached 12h, so this is usually a no-op; see services/zoom.ts).
    // Loaded unconditionally: the blocking conflict check below runs for an explicit zoomHost
    // even when zoomEnabled is false (a Suspended meeting), and it must use the same per-host
    // capacity an Active meeting would get.
    const hostCapacities = await getZoomHostCapacities();

    let result: {
      createdMeeting: Meeting;
      createdPattern: Awaited<ReturnType<typeof prisma.recurrencePattern.create>> | null;
      createdLinked: (Meeting & { recurrencePattern: Awaited<ReturnType<typeof prisma.recurrencePattern.create>> | null }) | null;
    };
    try {
      result = await prisma.$transaction(async (tx) => {
        const claims: ResourceClaim[] = [];
        if (meetingData.room) claims.push({ type: "room", value: meetingData.room });
        if (meetingData.zoomRoom) claims.push({ type: "zoomRoom", value: meetingData.zoomRoom });
        if (linkedPlan?.room) claims.push({ type: "room", value: linkedPlan.room });
        if (linkedPlan?.zoomRoom) claims.push({ type: "zoomRoom", value: linkedPlan.zoomRoom });
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
          // The linked schedule's own rooms get the same full check against the rest of the
          // calendar. Neither new row is in the database yet, so nothing here can report the two
          // schedules as colliding with each other -- and they cannot in any case, since their
          // weekdays are disjoint.
          if (linkedPlan?.room) {
            conflictRows.push(...await findResourceConflictRows("room", linkedPlan.room, linkedPlan.candidate, tx, { excludeMid: linkedPlan.mid }));
          }
          if (linkedPlan?.zoomRoom) {
            conflictRows.push(...await findResourceConflictRows("zoomRoom", linkedPlan.zoomRoom, linkedPlan.candidate, tx, { excludeMid: linkedPlan.mid }));
          }
          if (meetingData.zoomHost) {
            zoomHostConflictRows = await findResourceConflictRows(
              "zoomHost", meetingData.zoomHost, zoomCandidate, tx,
              { excludeMid: meetingData.mid, includeSuspended: true, capacity: hostCapacities[meetingData.zoomHost] ?? 1 },
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
                  "zoomHost", meetingData.zoomHost, zoomCandidate, tx,
                  { excludeMid: meetingData.mid, includeSuspended: true, capacity: hostCapacities[meetingData.zoomHost] ?? 1 },
                )
              : [];
            if (conflicts.length === 0 && zoomHostConflictRows.length === 0) {
              resolvedHost = meetingData.zoomHost;
            } else {
              zoomSyncError = "This time conflicts with another meeting using the same Zoom host.";
              attemptedZoomHost = meetingData.zoomHost;
            }
          } else {
            // Resolved once, against the family's whole booking -- one host reservation for one
            // Zoom meeting, never one per schedule.
            const poolResolvedHost = await resolveZoomHost(zoomCandidate, tx, { excludeMid: meetingData.mid, capacities: hostCapacities });
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
          // An In-Person schedule must never hold a zid/zoomLink, whoever supplied it: its
          // calendar event would advertise a join link for a meeting that never meets online,
          // and buildZoomRecurrence would union its weekdays into Zoom's single schedule (the
          // invariant in util/meetings/linkedSchedules.ts). Keyed on the MODE, not on
          // primaryZoomBearing, so a suspended Hybrid schedule still keeps the adopted Zoom
          // meeting it was created with.
          ...(isZoomBearing(meetingData) ? {} : { zid: null, zoomLink: null, zoomPasscode: null, zoomInvitation: null }),
          // Never the family's host on a schedule that doesn't use Zoom: an In-Person primary
          // schedule whose linked schedule is Remote holds no Zoom identity at all.
          zoomHost: primaryZoomBearing ? resolvedHost : null,
          attemptedZoomHost: primaryZoomBearing ? attemptedZoomHost : null,
          ...(primaryZoomBearing && zoomSyncError ? { zoomSyncStatus: 'error', zoomSyncError } : {}),
        };

        // meetingDetails.mid is client-generated (see NewMeeting.tsx's uuidv4()) and known
        // before either write, so both creates stay part of this same transaction instead of a
        // create-then-create sequence an interrupted request could leave half-done (a Meeting
        // with isRecurring: true and no RecurrencePattern row). The linked schedule's mid is
        // client-generated for the same reason, so its row joins this transaction too -- a
        // family that exists half-written is not a shape any later request could repair.
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

        const createdLinked = linkedPlan
          ? await tx.meeting.create({
              data: {
                mid: linkedPlan.mid,
                // Identity, content and calendars are the family's, copied from the primary
                // schedule -- only the mode, the rooms that mode needs and the weekdays are the
                // linked schedule's own (see linkedScheduleBlockSchema's RULE comment).
                title: meetingData.title,
                description: meetingData.description,
                creator: meetingData.creator,
                lastEditedBy: null,
                group: meetingData.group,
                email: meetingData.email,
                calType: meetingData.calType,
                fellowship: meetingData.fellowship ?? null,
                // The family's ONE Zoom meeting has one set of advanced settings -- both rows
                // carry them (like zid/link below) so either member's sync sends the same body.
                zoomCustomPasscode: meetingData.zoomCustomPasscode ?? null,
                zoomMeetAnytime: meetingData.zoomMeetAnytime ?? false,
                zoomJoinBeforeHost: meetingData.zoomJoinBeforeHost ?? true,
                // Mirrors the primary schedule's status rather than being pinned Active: both
                // rows are born here, together, so there is no prior suspension for this row to
                // wrongly inherit -- and a family whose halves disagreed would have one schedule
                // publishing calendar events while the other stayed dark.
                status: meetingData.status,
                startDateTime: linkedPlan.startDateTime,
                endDateTime: linkedPlan.endDateTime,
                modeType: linkedPlan.modeType,
                room: linkedPlan.room,
                zoomRoom: linkedPlan.zoomRoom,
                isRecurring: true,
                linkedToMid: meetingDetails.mid,
                // A second mode, not a division of the primary schedule's series -- the two
                // lineage columns are deliberately distinct (schema.prisma).
                splitFromMid: null,
                googleCalendarEventIds: Prisma.DbNull,
                // The family's one Zoom identity, whether it was supplied with the payload (an
                // adopted meeting) or is about to be minted by the deferred sync. An In-Person
                // linked schedule gets none of it.
                ...(linkedPlan.zoomBearing
                  ? {
                      zid: meetingData.zid ?? null,
                      zoomLink: meetingData.zoomLink ?? null,
                      zoomPasscode: meetingData.zoomPasscode ?? null,
                      zoomInvitation: meetingData.zoomInvitation ?? null,
                      zoomHost: resolvedHost,
                      attemptedZoomHost,
                      ...(zoomSyncError ? { zoomSyncStatus: 'error', zoomSyncError } : {}),
                    }
                  : {}),
                recurrencePattern: {
                  create: {
                    type: 'weekly',
                    startDate: linkedPlan.patternStartDate,
                    endDate: linkedPlan.endDate,
                    numberOfOccurrences: linkedPlan.numberOfOccurrences ?? undefined,
                    daysOfWeek: linkedPlan.daysOfWeek,
                    firstDayOfWeek: linkedPlan.firstDayOfWeek,
                    interval: linkedPlan.interval,
                    weekOfMonth: null,
                    dayOfMonth: null,
                    excludedDates: [],
                  },
                },
              },
              include: { recurrencePattern: true },
            })
          : null;

        return { createdMeeting, createdPattern, createdLinked };
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
    const responseMeeting = {
      ...newMeeting,
      ...(result.createdPattern ? { recurrencePattern: result.createdPattern } : {}),
      ...(result.createdLinked ? { linkedMid: result.createdLinked.mid } : {}),
    };

    // The rows the deferred sync publishes, primary first -- the family's Zoom meeting is minted
    // from the first Zoom-bearing one.
    const syncRows: NewMeetingSyncRow[] = [
      { mid: newMeeting.mid, meeting: meetingData, isRecurring, zoomBearing: primaryZoomBearing },
      ...(result.createdLinked
        ? [{
            mid: result.createdLinked.mid,
            meeting: result.createdLinked as unknown as IMeeting,
            isRecurring: true,
            zoomBearing: linkedZoomBearing,
          }]
        : []),
    ];

    // GCal/Zoom sync runs after the response is sent — see syncNewMeeting above. Caught here so
    // a throw mid-sync (as opposed to a handled failure, which syncNewMeeting already persists
    // as an error status itself) doesn't vanish as a silent unhandled rejection, leaving the
    // meeting's sync status at whatever it was before this run.
    after(
      syncNewMeeting(syncRows, auth.accessToken, resolvedHost, zoomSyncError)
        .catch(async (error) => {
          console.error("syncNewMeeting threw:", error);
          try {
            await prisma.meeting.updateMany({
              // Never a row that already finished: the two schedules publish one after the
              // other, so the second one throwing must not flip the first back to 'error' while
              // its calendar events are live. The explicit null arm is load-bearing -- a plain
              // `not` filter on a nullable column can't be relied on to match SQL NULLs.
              where: {
                mid: { in: syncRows.map((row) => row.mid) },
                OR: [{ googleSyncStatus: null }, { googleSyncStatus: { not: 'synced' } }],
              },
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

import { randomUUID } from "crypto";
import { Meeting, RecurrencePattern, SuspensionPeriod, Prisma, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../types/models";
import {
  createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars,
  calendarIdsForMeeting,
} from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomHostCapacities, getZoomMeetingInvitation, rehostZoomMeeting, resolveZoomHost, zoomHostPool, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, findResourceConflictRows, ConflictRow, ResourceConflictAbort } from "../../../../util/meetings/resourceOverlap";
import { lockResourceClaims, ResourceClaim } from "../../../../util/meetings/resourceLocks";
import { meetingSchema, editScopeSchema } from "../../../../util/meetings/meetingValidation";
import { reconcilePendingResume, tearDownPendingResumeSeries } from "../../../../util/meetings/suspension";
import { calculateEndDateFromOccurrences } from "../../../../util/meetings/meetingOccurrences";
import { EditScope, exclusionInstant, trimmedEndDate, isLiveOccurrence, rootSplitMid } from "../../../../util/meetings/editScope";
import { prisma } from "../../../../lib/prisma";

// Runs after the response is sent (see after() call below) — failure updates googleSyncStatus
// but does not fail the request, which has already returned by the time this runs.
//
// Zoom resolves/updates FIRST, before the main calType-calendar reconcile -- same reasoning
// as write/meeting/route.ts's syncNewMeeting: the calType events need the real zoomLink (they
// were passed a zoomLink-less object before), and a meeting that needs Zoom but doesn't have a
// working one after this run (host pool exhausted, API error) skips the calendar reconcile
// entirely rather than publishing "fully scheduled" with a missing link -- the "Retry sync"
// route (update/meeting/sync/route.ts) picks it back up once a host becomes available.
async function syncUpdatedMeeting(
  mid: string,
  newMeeting: IMeeting,
  existingMeeting: Meeting,
  accessToken: string | undefined,
  resolvedHost: string | null,
  // The specific reason resolvedHost is null (pool exhausted vs. a manually-picked host that
  // conflicts) -- computed synchronously in updateMeeting, before this ever runs. Without this,
  // both reasons collapsed to the same generic "pool exhausted" message below.
  hostSyncError: string | null,
): Promise<void> {
  if (newMeeting.status === 'Suspended') return;

  const zoomEnabled = newMeeting.modeType === 'Hybrid' || newMeeting.modeType === 'Remote';

  const oldZoomRoom = existingMeeting.zoomRoom;
  const newZoomRoom = newMeeting.zoomRoom;
  let zid = existingMeeting.zid;
  let zoomLink = existingMeeting.zoomLink;
  let zoomPasscode = existingMeeting.zoomPasscode;
  let zoomHost = existingMeeting.zoomHost;
  let zoomCalendarEventId = existingMeeting.zoomCalendarEventId;
  let zoomSynced = true;
  let zoomSyncError: string | null = null;
  // Set true when the kept Zoom meeting couldn't actually be moved to the new time (a host
  // time-conflict, below) -- read outside this block by zoomBlocking, so the calType calendar
  // reconcile doesn't publish the new time while Zoom itself is still sitting at the old one.
  let skipCalendarTimeSync = false;

  if (zoomEnabled) {
    // A room isn't tied to any particular Zoom meeting (#522) -- a room change alone moves only
    // the join-link event between room calendars below, in place, the same way it already works
    // for an unmanaged meeting. An admin explicitly reassigning the host via the Zoom Host
    // dropdown is handled by the in-place transfer below instead. A blank/"Automatic" selection
    // is NOT a reassignment -- it just means "don't force a specific host," so whatever host is
    // already assigned is kept.
    const roomChanged = !!oldZoomRoom && oldZoomRoom !== newZoomRoom;
    // Case-insensitive (#504): a casing-only difference (Zoom-registered vs ZOOM_HOSTS casing)
    // is the same physical host, not a reassignment.
    const explicitHostChange = !!newMeeting.zoomHost &&
      newMeeting.zoomHost.toLowerCase() !== (existingMeeting.zoomHost ?? "").toLowerCase();

    // A host-only reassignment of a Zoom meeting the app owns moves it with `schedule_for`,
    // which preserves the meeting ID, passcode and join URL members already have (#516). Bundled
    // with a room change, this still recreates instead (below) -- schedule_for moves a host, not
    // a room, so there's nothing for it to help with there, and the recreate path already
    // handles the room move as a side effect of publishing under the fresh meeting.
    const rehostZid = explicitHostChange && !roomChanged && existingMeeting.zoomManaged ? zid : null;
    // Set when the transfer was attempted and refused by Zoom (missing scheduling privilege,
    // basic-tier host) on a meeting no other row shares -- recreating is then still an option.
    let rehostFellBackToRecreate = false;
    // Set when the requested host's capacity was already verified for this schedule, so the
    // kept-zid branch below doesn't re-check it -- a sibling row that just moved to the same
    // host would otherwise read as that host's own booking and look like a false conflict.
    let hostTimeAlreadyChecked = false;

    if (rehostZid) {
      const requestedHost = newMeeting.zoomHost as string;
      const timeConflicts = await findResourceConflicts("zoomHost", requestedHost, newMeeting, prisma, {
        excludeMid: mid,
        includeSuspended: true,
        capacity: (await getZoomHostCapacities())[requestedHost] ?? 1,
      });
      if (timeConflicts.length > 0) {
        zoomSynced = false;
        zoomSyncError = "The requested Zoom host is already at capacity for this time.";
        skipCalendarTimeSync = true;
      } else if (await rehostZoomMeeting(rehostZid, requestedHost)) {
        zoomHost = requestedHost;
        hostTimeAlreadyChecked = true;
        // One Zoom meeting has exactly one real host, so every active row pointing at this zid
        // follows it -- otherwise a sibling row's capacity accounting would name a host that no
        // longer runs the meeting.
        await prisma.meeting.updateMany({ where: { zid, deletedAt: null }, data: { zoomHost } });
      } else {
        const siblingCount = await prisma.meeting.count({
          where: { zid, deletedAt: null, mid: { not: mid } },
        });
        if (siblingCount > 0) {
          // Recreating would give this row a fresh zid and split the bundle away from its
          // siblings, so a shared Zoom meeting stays put and reports the failed move instead.
          zoomSynced = false;
          zoomSyncError = "Couldn't move this shared Zoom meeting to the requested host; the host is unchanged.";
        } else {
          rehostFellBackToRecreate = true;
        }
      }
    }

    // A genuine recreate reason -- distinct from a pure room change (#522). Neither reason
    // implies the other, and both can fire together (e.g. an explicit host change bundled with a
    // room change): the recreate wins in that case, the room move just becomes where the fresh
    // meeting ends up published, since createZoomMeeting/the room-cal create below always use
    // newMeeting's (new) room regardless of which branch got Zoom to this point.
    const needsRecreate = (explicitHostChange && !rehostZid) || rehostFellBackToRecreate;

    if (needsRecreate || roomChanged) {
      // Only a genuine recreate reason ever tears down the Zoom meeting itself -- a pure room
      // change (no recreate reason) leaves it running untouched under its existing zid/host, the
      // same way an unmanaged meeting's room change already did (host changes were already
      // 422'd upstream for those, so needsRecreate can never be true there). This also makes the
      // shared-zid sibling guard below moot for a pure room move: nothing here would tear the
      // Zoom meeting down in the first place, so there's nothing for a sibling to be guarded
      // against.
      if (needsRecreate && zid && existingMeeting.zoomManaged) {
        // Shared-zid guard: a sibling row (same group, second schedule variant) may still point
        // at this Zoom meeting -- only the last referencing row actually tears it down.
        const siblingCount = await prisma.meeting.count({
          where: { zid, deletedAt: null, mid: { not: mid } },
        });
        if (siblingCount === 0) {
          const ok = await deleteZoomMeeting(zid);
          if (!ok) zoomSynced = false;
        }
      }
      // The join-link event always moves off the old room's calendar here, recreate or not --
      // the downstream zoomCalendarEventId === null branch republishes it on the new room's
      // calendar (with either the kept or the freshly-created link).
      if (accessToken && zoomCalendarEventId && oldZoomRoom) {
        const oldCalId = zoomRoomCalendarId[oldZoomRoom];
        if (oldCalId) {
          const ok = await deleteCalendarEvent(accessToken, zoomCalendarEventId, oldCalId);
          if (!ok) zoomSynced = false;
        }
      }
      if (needsRecreate && existingMeeting.zoomManaged) {
        zid = null;
        zoomLink = null;
        zoomPasscode = null;
        zoomHost = null;
      }
      zoomCalendarEventId = null;
    }

    // Same existing Zoom meeting kept -- keep the host that's already assigned; no
    // re-resolution, so an existing recurring meeting never loses its host mid-series. But
    // the time itself may have changed, so re-check that the current host is still free for
    // the new schedule before pushing the update to Zoom — otherwise a time edit could
    // silently double-book a host that's fine for the old time but busy at the new one.
    if (zid) {
      const timeConflicts = zoomHost && !hostTimeAlreadyChecked && !skipCalendarTimeSync
        ? await findResourceConflicts("zoomHost", zoomHost, newMeeting, prisma, {
            excludeMid: mid,
            includeSuspended: true,
            capacity: (await getZoomHostCapacities())[zoomHost] ?? 1,
          })
        : [];
      if (timeConflicts.length > 0) {
        zoomSynced = false;
        zoomSyncError = "This time now conflicts with another meeting using the same Zoom host.";
        skipCalendarTimeSync = true;
      } else if (!skipCalendarTimeSync) {
        // A blocked host transfer above already left Zoom untouched; pushing the new schedule to
        // a meeting the app just declined to move would half-apply the edit.
        // Unmanaged Zoom meetings are never PATCHed -- the stored link is the contract; only
        // the calendars follow the app-side edit.
        // The pinned topic (if any) lives on the DB row, not the client payload -- thread it
        // through so a managed PATCH keeps the meeting's established Zoom name. Sibling rows
        // sharing this zid ride along so the PATCH sends the whole union schedule (#513).
        const scheduleSiblings = existingMeeting.zoomManaged
          ? await prisma.meeting.findMany({
              where: { zid, deletedAt: null, mid: { not: newMeeting.mid } },
              include: { recurrencePattern: true },
            })
          : [];
        const ok = existingMeeting.zoomManaged
          ? await updateZoomMeeting(zid, { ...newMeeting, zoomTopic: existingMeeting.zoomTopic }, scheduleSiblings as unknown as IMeeting[])
          : true;
        if (!ok) zoomSynced = false;
      }
    } else if (!existingMeeting.zoomManaged) {
      // An unmanaged meeting with no zid means an admin deliberately points it outside the
      // app's Zoom account -- never auto-provision an app-owned meeting under the flag that
      // says the app doesn't own it.
    } else {
      // Already resolved (and persisted) synchronously in updateMeeting, before this ever
      // runs — see the comment there for why. This only does the network-bound half:
      // actually creating the Zoom meeting under that host.
      const host = resolvedHost;
      if (!host) {
        zoomSynced = false;
        zoomSyncError = hostSyncError ?? "No Zoom host available for this meeting's schedule (pool exhausted).";
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

    // Only Hybrid meetings have a zoomRoom -- Remote's dedicated per-room Zoom-Room calendar
    // publish naturally no-ops here; its Zoom link is carried by the main calType-calendar
    // reconcile below instead. zoomCalendarEventId is null whenever the teardown above ran
    // (a room change, or a host reassignment that fell back to a recreate), so checking it alone
    // decides update-vs-create here.
    if (accessToken && zoomLink && newZoomRoom && !skipCalendarTimeSync) {
      const calId = zoomRoomCalendarId[newZoomRoom];
      if (calId) {
        const meetingWithZoomLink = { ...newMeeting, zoomLink };
        if (zoomCalendarEventId) {
          const { ok, error } = await updateCalendarEvent(accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink);
          if (!ok) {
            zoomSynced = false;
            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting's calendar event failed to update.";
          }
        } else {
          const { id: eventId, error } = await createCalendarEvent(accessToken, meetingWithZoomLink, calId, zoomLink);
          if (eventId) zoomCalendarEventId = eventId;
          else {
            zoomSynced = false;
            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting created but its calendar event failed to sync.";
          }
        }
      }
    }
  }

  // True when this meeting needs Zoom but doesn't have a working Zoom meeting after the
  // block above (host pool exhausted / API failure), OR the kept Zoom meeting couldn't be
  // moved to the new time (a host time-conflict, see skipCalendarTimeSync above) -- either
  // way, the calendar reconcile below is deferred, not run with a missing or stale link.
  const zoomBlocking = zoomEnabled && (!zid || skipCalendarTimeSync);
  const meetingForCalendar: IMeeting = { ...newMeeting, zoomLink };

  if (zoomBlocking) {
    await prisma.meeting.update({ where: { mid }, data: { googleSyncStatus: 'pending' } });
  } else if (accessToken) {
    const existingEventIds = (existingMeeting.googleCalendarEventIds ?? {}) as Record<string, string>;
    const { updatedEventIds, allSynced, googleSyncError } = await reconcileMeetingCalendars(
      accessToken,
      meetingForCalendar,
      existingEventIds,
    );

    await prisma.meeting.update({
      where: { mid },
      data: {
        googleCalendarEventIds: updatedEventIds,
        googleSyncStatus: allSynced ? 'synced' : 'error',
        googleSyncError: allSynced ? null : googleSyncError,
      },
    });
  } else {
    // No accessToken and not zoomBlocking -- without this branch googleSyncStatus is never
    // touched by this run, leaving it at whatever it already was (often null) with nothing
    // surfacing the failure to an admin.
    await prisma.meeting.update({
      where: { mid },
      data: { googleSyncStatus: 'error', googleSyncError: "No Google Calendar access token available for this sync." },
    });
  }

  if (zoomEnabled) {
    // Scoped to its own try/catch, separate from the outer after()'s .catch() in the route
    // handler -- by this point the googleSyncStatus write above has unconditionally already
    // happened (every branch of the if/else-if/else above writes it), so a throw here must
    // never be allowed to reach that outer catch and overwrite an already-correct
    // googleSyncStatus with 'error' while misattributing a Zoom-side failure as a Google one.
    try {
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
    } catch (error) {
      console.error("syncUpdatedMeeting: failed to persist the final Zoom sync status:", error);
      try {
        await prisma.meeting.update({
          where: { mid },
          data: { zoomSyncStatus: 'error', zoomSyncError: "Zoom sync status update failed unexpectedly." },
        });
      } catch (persistError) {
        console.error("Failed to persist Zoom sync failure status:", persistError);
      }
    }
  }
}

// Runs after the response is sent — parent-side Google Calendar half of a scoped edit: a
// full-body rewrite of each configured calType event from the parent's POST-WRITE
// RecurrencePattern (buildEventBody regenerates the whole recurrence -- RRULE + EXDATEs -- from
// it, so a plain events.update is sufficient for both 'this' and 'thisAndFollowing'; no more
// surgical EXDATE/UNTIL patch), plus the parent's OWN Zoom-Room join-link event (if it has one)
// -- previously never EXDATEd/trimmed by a scoped edit at all, so a "This event" split off a
// Hybrid parent left the parent's room-cal event still describing the now-excluded occurrence.
// Mirrors how that event was created (write/meeting's syncNewMeeting): same calendar
// (zoomRoomCalendarId[zoomRoom]), same locationOverride (the join link). Skipped for a currently
// suspended parent -- its live GCal recurrence already carries a suspension-only UNTIL trim
// (syncSuspend in update/meeting/suspend/route.ts, via trimCalendarEventSeries) that isn't
// represented in RecurrencePattern at all, and a full-body rewrite from the stored pattern would
// silently resurrect whatever the suspension hid -- same reasoning as syncUpdatedMeeting's
// suspended early-return above.
async function syncScopedParentCalendar(
  status: string,
  accessToken: string | undefined,
  calendarIds: Record<string, string>,
  eventIds: Record<string, string>,
  meetingForCalendar: IMeeting,
  zoomCalendarEventId: string | null,
  zoomRoom: string | null,
): Promise<void> {
  if (!accessToken || status === 'Suspended') return;
  for (const [cat, calId] of Object.entries(calendarIds)) {
    const eventId = eventIds[cat];
    if (eventId) await updateCalendarEvent(accessToken, eventId, meetingForCalendar, calId);
  }
  // A null zoomLink here would fall back to buildEventBody's street-address default as this
  // event's `location` (see the locationOverride comment there) -- publishing that onto a
  // Zoom-Room calendar breaks the room hardware's one-touch join detection, which keys off a
  // real Zoom URL. Only rewrite when there's still a real link to publish.
  if (zoomCalendarEventId && zoomRoom && meetingForCalendar.zoomLink) {
    const calId = zoomRoomCalendarId[zoomRoom];
    if (calId) await updateCalendarEvent(accessToken, zoomCalendarEventId, meetingForCalendar, calId, meetingForCalendar.zoomLink);
  }
}

// Runs after the response is sent — creates the split-off row's own Google Calendar events (and
// its Zoom-Room event, if any) and persists its sync statuses. No Zoom API call: the row
// inherits the parent's zid/zoomHost/zoomLink (see handleScopedEdit), so there's nothing for
// Zoom sync to do beyond marking it synced -- mirrors write/meeting/route.ts's syncNewMeeting,
// minus the Zoom-provisioning half.
async function syncSplitMeeting(
  newMid: string,
  meetingData: IMeeting,
  isRecurring: boolean,
  accessToken: string | undefined,
): Promise<void> {
  // Defense in depth, same guard as syncUpdatedMeeting's -- the caller always creates a
  // split-off row with status: 'Active' (it has no suspension history of its own), so this
  // should never actually trigger, but a suspended meeting's calendar events must never be
  // published regardless of how that status got here.
  if (meetingData.status === 'Suspended') return;

  const zoomEnabled = meetingData.modeType === 'Hybrid' || meetingData.modeType === 'Remote';
  const meetingForSync: IMeeting = { ...meetingData, isRecurring };

  let googleCalendarEventIds: Record<string, string> | undefined;
  let googleSyncStatus: string | undefined;
  let googleSyncError: string | null | undefined;

  if (accessToken) {
    const requestedCalTypes = meetingData.calType ?? [];
    const calendarIds = calendarIdsForMeeting(requestedCalTypes);
    const eventIds: Record<string, string> = {};
    const unconfiguredCat = requestedCalTypes.find((cat) => !calendarIds[cat]);
    let syncError: string | null = unconfiguredCat
      ? `Calendar for "${unconfiguredCat}" is not configured.`
      : null;
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const { id, error } = await createCalendarEvent(accessToken, meetingForSync, calId);
      if (id) eventIds[cat] = id;
      else syncError = syncError ?? error;
    }
    const synced = requestedCalTypes.length > 0 && requestedCalTypes.every((cat) => eventIds[cat]);
    googleCalendarEventIds = eventIds;
    googleSyncStatus = synced ? 'synced' : 'error';
    googleSyncError = synced ? null : syncError;
  } else {
    googleSyncStatus = 'error';
    googleSyncError = "No Google Calendar access token available for this sync.";
  }

  let zoomCalendarEventId: string | null = null;
  let zoomSynced = true;
  let zoomSyncError: string | null = null;
  if (zoomEnabled && accessToken && meetingData.zoomLink && meetingData.zoomRoom) {
    const calId = zoomRoomCalendarId[meetingData.zoomRoom];
    if (calId) {
      const { id: eventId, error } = await createCalendarEvent(accessToken, meetingForSync, calId, meetingData.zoomLink);
      if (eventId) zoomCalendarEventId = eventId;
      else {
        zoomSynced = false;
        zoomSyncError = error ?? "The split-off meeting's Zoom calendar event failed to sync.";
      }
    }
  }

  await prisma.meeting.update({
    where: { mid: newMid },
    data: {
      googleCalendarEventIds, googleSyncStatus, googleSyncError,
      ...(zoomEnabled
        ? { zoomCalendarEventId, zoomSyncStatus: zoomSynced ? 'synced' : 'error', zoomSyncError: zoomSynced ? null : zoomSyncError }
        : {}),
    },
  });
}

// Handles editScope 'this' / 'thisAndFollowing': trims/excludes the parent series and splits the
// edited values off into a new detached (scope 'this') or new recurring (scope
// 'thisAndFollowing') Meeting row. Only reached once the caller has already confirmed the parent
// is recurring, occurrenceDate is present, and occurrenceDate lands on a live occurrence -- see
// the branch in updateMeeting below.
async function handleScopedEdit(
  auth: { accessToken?: string; user?: { email?: string | null } | null },
  existingMeeting: Meeting & { recurrencePattern: RecurrencePattern | null; suspensions: SuspensionPeriod[] },
  newMeeting: IMeeting,
  scope: 'this' | 'thisAndFollowing',
  occurrenceDate: Date,
  confirmOverride: boolean,
): Promise<Response> {
  const mid = existingMeeting.mid;
  const newMid = randomUUID();
  const splitFromMid = rootSplitMid(existingMeeting);
  const isRecurringSplit = scope === 'thisAndFollowing';

  let calculatedEndDate: Date | null = null;
  if (isRecurringSplit) {
    const rp = newMeeting.recurrencePattern!;
    calculatedEndDate = rp.endDate ?? null;
    if (rp.numberOfOccurrences && !rp.endDate) {
      calculatedEndDate = calculateEndDateFromOccurrences(
        occurrenceDate, rp.daysOfWeek || [], rp.numberOfOccurrences, rp.interval || 1,
        rp.type, rp.weekOfMonth ?? null, rp.dayOfMonth ?? null,
      );
    }
  }

  // License-dependent per-host capacities, resolved before the locked transaction below -- same
  // reasoning as the 'all' path (a Zoom API round trip while advisory locks are held would
  // extend lock hold time by an external call's latency; cached 12h, usually a no-op).
  const hostCapacities = await getZoomHostCapacities();

  let txResult: { updatedParent: Meeting & { recurrencePattern: RecurrencePattern | null }; createdMeeting: Meeting; hasStaleResumeSeries: boolean };
  try {
    txResult = await prisma.$transaction(async (tx) => {
      const claims: ResourceClaim[] = [];
      if (newMeeting.room) claims.push({ type: "room", value: newMeeting.room });
      // The CHILD's own requested room (which may differ from the parent's) -- the Zoom
      // meeting is host-owned, not room-owned, so a scoped edit is free to move the child's
      // room-cal event to a different Zoom Room while the inherited zid/link keep working.
      if (newMeeting.zoomRoom) claims.push({ type: "zoomRoom", value: newMeeting.zoomRoom });
      if (existingMeeting.zoomHost) claims.push({ type: "zoomHost", value: existingMeeting.zoomHost });
      await lockResourceClaims(tx, claims);

      // Trim/exclude the parent BEFORE conflict-checking the new row's candidate below, so the
      // parent's own remaining occurrences (post-trim) don't self-collide with it.
      const updatedParent = await tx.meeting.update({
        where: { mid },
        data: {
          lastEditedBy: auth.user?.email ?? null,
          // numberOfOccurrences explicitly nulled on the trim branch -- same reasoning as
          // delete/meeting/route.ts's 'thisAndFollowing' trim: a stale count would win back over
          // this endDate the next time toRRule serializes the pattern (see toRRule's
          // endDate-wins comment), un-trimming the parent the next time a whole-series edit
          // resubmits the stored count.
          recurrencePattern: scope === 'this'
            ? { update: { excludedDates: { push: exclusionInstant(occurrenceDate) } } }
            : { update: { endDate: trimmedEndDate(occurrenceDate), numberOfOccurrences: null } },
        },
        include: { recurrencePattern: true },
      });

      // A pending resume series pre-created for a scheduled suspension only makes sense if the
      // series still reaches that far -- mirrors delete/meeting/route.ts's identical check.
      let hasStaleResumeSeries = false;
      if (scope === 'thisAndFollowing') {
        const newEndDate = updatedParent.recurrencePattern!.endDate!;
        hasStaleResumeSeries = existingMeeting.suspensions.some(
          (s) => !s.promoted && s.resumeEventIds && s.to && s.to.getTime() > newEndDate.getTime(),
        );
      }

      const candidate = {
        mid: newMid,
        title: newMeeting.title,
        room: newMeeting.room,
        // The CHILD's own requested room -- zid/host/link/passcode/zoomManaged/zoomTopic are
        // still inherited from the parent regardless (below), but the room itself is not: the
        // Zoom meeting is host-owned, not room-owned, so the child is free to publish its
        // join-link event on a different Zoom Room's calendar than the parent's.
        zoomRoom: newMeeting.zoomRoom,
        zoomHost: existingMeeting.zoomHost,
        // A split-off row always starts Active -- it has no suspension history of its own, and
        // a scoped edit is never how a suspension gets created (that's the dedicated
        // suspend/resume flow). Never the parent's or the payload's status: if the parent
        // happens to be suspended, the child must not silently inherit that.
        status: 'Active',
        calType: newMeeting.calType,
        startDateTime: newMeeting.startDateTime,
        endDateTime: newMeeting.endDateTime,
        isRecurring: isRecurringSplit,
        recurrencePattern: isRecurringSplit
          ? { ...newMeeting.recurrencePattern!, startDate: occurrenceDate, endDate: calculatedEndDate, excludedDates: newMeeting.recurrencePattern!.excludedDates ?? [] }
          : null,
      };

      // room/zoomRoom must NOT exclude the parent: the client can legitimately re-date a "This
      // event" child onto another day the series itself still meets (e.g. moving a Monday
      // occurrence to that same series' Wednesday slot), and the parent's occurrence on THAT day
      // is still very much live in this same room -- only the one occurrence at occurrenceDate
      // was excluded above, not the whole parent. Excluding the parent here would let the child
      // double-book its own series' room/Zoom Room undetected.
      //
      // zoomHost DOES exclude the parent for scope 'this': same zid means the same real Zoom
      // meeting/host, so the parent's own occurrences "sharing the host" is not a second booking
      // to flag, just the same one Zoom meeting the child inherits.
      const zoomHostExcludeMid = scope === 'this' ? mid : undefined;

      if (!confirmOverride) {
        const conflictRows: ConflictRow[] = [];
        if (candidate.room) {
          conflictRows.push(...await findResourceConflictRows("room", candidate.room, candidate, tx, {}));
        }
        if (candidate.zoomRoom) {
          conflictRows.push(...await findResourceConflictRows("zoomRoom", candidate.zoomRoom, candidate, tx, {}));
        }
        if (candidate.zoomHost) {
          conflictRows.push(...await findResourceConflictRows(
            "zoomHost", candidate.zoomHost, candidate, tx,
            { excludeMid: zoomHostExcludeMid, includeSuspended: true, capacity: hostCapacities[candidate.zoomHost] ?? 1 },
          ));
        }
        if (conflictRows.length > 0) {
          throw new ResourceConflictAbort(conflictRows);
        }
      }

      const createdMeeting = await tx.meeting.create({
        data: {
          mid: newMid,
          title: newMeeting.title,
          description: newMeeting.description,
          creator: auth.user?.email ?? existingMeeting.creator,
          lastEditedBy: null,
          group: newMeeting.group,
          startDateTime: newMeeting.startDateTime,
          endDateTime: newMeeting.endDateTime,
          email: newMeeting.email,
          calType: newMeeting.calType,
          modeType: newMeeting.modeType,
          room: newMeeting.room,
          // Always Active -- see the identical comment on `candidate` above.
          status: 'Active',
          isRecurring: isRecurringSplit,
          // Zoom identity inherited, not re-provisioned, regardless of room -- see the
          // Zoom-inheritance decision in editScope.ts's callers. The shared-zid PATCH machinery
          // (services/zoom.ts) already discovers this row as a sibling on subsequent edits since
          // it queries by zid. zoomRoom is the one exception: the Zoom meeting is host-owned, not
          // room-owned, so the child publishes its own join-link event on whichever Zoom Room it
          // was submitted with (see candidate above).
          zid: existingMeeting.zid,
          zoomLink: existingMeeting.zoomLink,
          zoomPasscode: existingMeeting.zoomPasscode,
          zoomInvitation: existingMeeting.zoomInvitation,
          zoomRoom: newMeeting.zoomRoom,
          zoomHost: existingMeeting.zoomHost,
          zoomManaged: existingMeeting.zoomManaged,
          zoomTopic: existingMeeting.zoomTopic,
          splitFromMid,
          ...(isRecurringSplit
            ? {
                recurrencePattern: {
                  create: {
                    type: newMeeting.recurrencePattern!.type,
                    startDate: occurrenceDate,
                    endDate: calculatedEndDate,
                    numberOfOccurrences: newMeeting.recurrencePattern!.numberOfOccurrences ?? undefined,
                    daysOfWeek: newMeeting.recurrencePattern!.daysOfWeek ?? [],
                    firstDayOfWeek: newMeeting.recurrencePattern!.firstDayOfWeek,
                    interval: newMeeting.recurrencePattern!.interval,
                    weekOfMonth: newMeeting.recurrencePattern!.weekOfMonth ?? null,
                    dayOfMonth: newMeeting.recurrencePattern!.dayOfMonth ?? null,
                    excludedDates: newMeeting.recurrencePattern!.excludedDates ?? [],
                  },
                },
              }
            : {}),
        },
      });

      return { updatedParent, createdMeeting, hasStaleResumeSeries };
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

  const { updatedParent, createdMeeting, hasStaleResumeSeries } = txResult;
  const calendarIds = calendarIdsForMeeting(existingMeeting.calType ?? []);
  const eventIds = (existingMeeting.googleCalendarEventIds ?? {}) as Record<string, string>;
  // The parent's OWN field values (unchanged by a scoped edit -- only its pattern is
  // trimmed/excluded) plus the just-written post-trim pattern from the transaction result.
  const parentForCalendar = { ...existingMeeting, recurrencePattern: updatedParent.recurrencePattern } as unknown as IMeeting;

  after(
    syncScopedParentCalendar(
      existingMeeting.status, auth.accessToken, calendarIds, eventIds, parentForCalendar,
      existingMeeting.zoomCalendarEventId, existingMeeting.zoomRoom,
    ).catch((error) => console.error("syncScopedParentCalendar threw:", error)),
  );
  if (hasStaleResumeSeries) {
    after(tearDownPendingResumeSeries(existingMeeting, auth.accessToken).catch((error) =>
      console.error("tearDownPendingResumeSeries threw:", error)));
  }
  after(
    syncSplitMeeting(
      newMid,
      // zoomRoom deliberately NOT overridden here -- newMeeting's own value (already what got
      // persisted onto the row above) is what should flow into the child's room-cal event, not
      // the parent's room. status is forced to 'Active' to match what was actually persisted
      // (see the create data above) -- newMeeting.status could still be the parent's 'Suspended'.
      { ...newMeeting, mid: newMid, zid: existingMeeting.zid, zoomLink: existingMeeting.zoomLink, status: 'Active' },
      isRecurringSplit,
      auth.accessToken,
    ).catch(async (error) => {
      console.error("syncSplitMeeting threw:", error);
      try {
        await prisma.meeting.update({
          where: { mid: newMid },
          data: { googleSyncStatus: 'error', googleSyncError: "Sync job failed unexpectedly." },
        });
      } catch (persistError) {
        console.error("Failed to persist split-meeting sync failure status:", persistError);
      }
    }),
  );

  return NextResponse.json({ ...updatedParent, newMid: createdMeeting.mid });
}

const updateMeeting = async (request: Request): Promise<Response> => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const rawBody = await request.json();
    const parsed = meetingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid meeting data", issues: parsed.error.issues }, { status: 400 });
    }
    const newMeeting = parsed.data as IMeeting;

    // Parsed separately from meetingSchema (see editScopeSchema's comment) -- absent or 'all'
    // means the current whole-series behavior below; 'this'/'thisAndFollowing' hand off to
    // handleScopedEdit instead.
    const scopeParsed = editScopeSchema.safeParse(rawBody);
    if (!scopeParsed.success) {
      return NextResponse.json({ error: "Invalid edit scope", issues: scopeParsed.error.issues }, { status: 400 });
    }
    const editScope: EditScope = scopeParsed.data.editScope ?? 'all';
    const occurrenceDate = scopeParsed.data.occurrenceDate ?? null;

    // Read before lockResourceClaims acquires anything below -- accepted gap, not covered by
    // this fix: two concurrent edits to this *same* meeting could each compute
    // explicitHostChange/needsNewHost from a stale snapshot of each other's not-yet-committed
    // change. This fix closes the race between DIFFERENT meetings racing for the same room/
    // zoomRoom/zoomHost value (the actual PR #303 gap); two edits racing on the identical `mid`
    // is a separate, narrower same-record concurrency question this pass doesn't address.
    const existingMeeting = await prisma.meeting.findUnique({
      where: {
        mid: newMeeting.mid,
      },
      include: { recurrencePattern: true, suspensions: true },
    });

    if (!existingMeeting) {
      console.error('Meeting not found:', newMeeting.mid);
      return NextResponse.json({ error: `Meeting with ID ${newMeeting.mid} not found` }, { status: 404 });
    }

    // Lazy self-heal: promote a scheduled resume's pre-created GCal series into
    // googleCalendarEventIds if its date has arrived but nothing's promoted it yet, before this
    // edit reads/writes that field below.
    existingMeeting.googleCalendarEventIds = await reconcilePendingResume(existingMeeting);

    if (editScope !== 'all') {
      if (!existingMeeting.recurrencePattern) {
        return NextResponse.json(
          { error: "This meeting is not recurring; editScope must be omitted or 'all'." },
          { status: 400 },
        );
      }
      if (!occurrenceDate) {
        return NextResponse.json({ error: "occurrenceDate is required for this edit scope." }, { status: 400 });
      }
      // Mode and host are whole-series properties -- unlike zoomRoom (the child is free to
      // publish on a different Zoom Room; the Zoom meeting is host-owned, not room-owned), a
      // mode or host change has series-wide consequences (Hybrid<->Remote changes what Zoom
      // needs to exist at all; a host reassignment moves capacity accounting for every
      // occurrence) that a single split-off row can't represent on its own. Previously a
      // scoped edit's modeType/zoomHost changes were silently ignored (the split row inherited
      // the parent's regardless of what was submitted) -- rejecting explicitly instead of
      // silently dropping the field.
      if (newMeeting.modeType !== existingMeeting.modeType) {
        return NextResponse.json({ error: "mode changes apply to the whole series" }, { status: 400 });
      }
      // Case-insensitive, non-empty-only -- same definition of "an explicit reassignment" the
      // 'all' path's explicitHostChange uses (a blank/"Automatic" selection, or resubmitting the
      // meeting's own already-assigned host, is not a change).
      const scopedExplicitHostChange = !!newMeeting.zoomHost &&
        newMeeting.zoomHost.toLowerCase() !== (existingMeeting.zoomHost ?? "").toLowerCase();
      if (scopedExplicitHostChange) {
        return NextResponse.json({ error: "host changes apply to the whole series" }, { status: 400 });
      }
      if (editScope === 'this' && newMeeting.recurrencePattern) {
        return NextResponse.json(
          { error: "editScope 'this' edits a single occurrence and cannot include a recurrencePattern." },
          { status: 400 },
        );
      }
      if (editScope === 'thisAndFollowing' && !newMeeting.recurrencePattern) {
        return NextResponse.json(
          { error: "editScope 'thisAndFollowing' requires a recurrencePattern for the new series." },
          { status: 400 },
        );
      }
      const pattern = existingMeeting.recurrencePattern;
      const patternLike = {
        type: pattern.type,
        startDate: pattern.startDate,
        endDate: pattern.endDate,
        interval: pattern.interval,
        daysOfWeek: pattern.daysOfWeek ?? [],
        weekOfMonth: pattern.weekOfMonth,
        dayOfMonth: pattern.dayOfMonth,
        excludedDates: pattern.excludedDates ?? [],
      };
      if (!isLiveOccurrence(patternLike, occurrenceDate)) {
        return NextResponse.json(
          { error: "occurrenceDate does not fall on a live occurrence of this meeting's recurrence pattern." },
          { status: 400 },
        );
      }
      return handleScopedEdit(auth, existingMeeting, newMeeting, editScope, occurrenceDate, !!newMeeting.confirmOverride);
    }

    // creator is server-managed provenance (set from the session at create time) -- an update
    // must never overwrite it with the client's placeholder value.
    const { mid, recurrencePattern, confirmOverride, creator: _creator, ...meetingFields } = newMeeting;

    // An explicit host reassignment (the Zoom Host dropdown set to a specific pool host,
    // different from whatever's currently assigned) -- hoisted above the confirmOverride block
    // below so the blocking conflict check can use it too, not just the resolution step further
    // down. A blank/"Automatic" selection, or resubmitting the form with the same
    // already-assigned host untouched, is NOT a reassignment.
    // Case-insensitive (#504): a casing-only difference (Zoom-registered vs ZOOM_HOSTS casing)
    // is the same physical host, not a reassignment.
    const explicitHostChange = !!newMeeting.zoomHost &&
      newMeeting.zoomHost.toLowerCase() !== (existingMeeting.zoomHost ?? "").toLowerCase();

    // An unmanaged Zoom meeting's host is whoever owns it on Zoom's side (externally
    // hosted -- see schema.prisma's zoomManaged); the app can't reassign that, and
    // persisting a different pool host would only make capacity accounting lie. Everything else
    // (rooms, times, content) is app/calendar-side and stays editable -- a Zoom-room change
    // just moves the join-link event between room calendars using the stored link.
    if (!existingMeeting.zoomManaged && explicitHostChange) {
      return NextResponse.json(
        { error: "This meeting's Zoom meeting is externally owned; its host can't be reassigned from the app." },
        { status: 422 },
      );
    }

    // A count-bounded series (numberOfOccurrences set, no explicit endDate) has a real last
    // occurrence -- checking conflicts against the raw (still-null) endDate would expand it out
    // to the full OVERLAP_HORIZON_YEARS window instead, risking a false 409/false zoomHost
    // conflict against an unrelated booking that falls after the series actually ends. Built
    // once, reused for every conflict/candidate check below (the blocking check, the zoomHost
    // re-check, and the pool-auto-assign call) -- only affects these checks, not what's
    // persisted (unchanged from the existing upsert further down).
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
    // BUG FIX: recurrencePattern.excludedDates is optional on the client payload -- when the
    // client doesn't resubmit per-occurrence deletions, this must fall back to the meeting's own
    // stored excludedDates, not silently drop them. Without this, a series with any 'this'-scope
    // exclusions would have its candidate occurrences expanded WITHOUT those exclusions here,
    // producing false-positive 409s against its own already-excluded dates.
    const candidate = {
      ...newMeeting,
      isRecurring: !!recurrencePattern,
      recurrencePattern: recurrencePattern
        ? {
            ...recurrencePattern,
            endDate: calculatedEndDate,
            excludedDates: recurrencePattern.excludedDates ?? existingMeeting.recurrencePattern?.excludedDates ?? [],
          }
        : null,
    };

    const zoomEnabled = newMeeting.status !== 'Suspended'
      && (newMeeting.modeType === 'Hybrid' || newMeeting.modeType === 'Remote');
    // A new Zoom host is only needed when this meeting has no Zoom meeting to keep using at
    // all -- it never had one, or an explicit host reassignment was requested. A ROOM change
    // alone does NOT need a new host (#522): room and host are independent resources, and
    // syncUpdatedMeeting moves a changed room's join-link event in place under the existing
    // host, the same way it already did for an unmanaged meeting. Getting this wrong here would
    // synchronously overwrite the DB row's zoomHost with a freshly-resolved pool host even
    // though the deferred sync never actually moves the Zoom meeting off its real host for a
    // pure room change -- the write and Zoom's own state would silently disagree.
    // explicitHostChange (hoisted above) counts because the requested host still has to be
    // capacity-checked and persisted here, whether the deferred sync then transfers the existing
    // Zoom meeting in place or has to recreate it.
    const needsNewHost =
      zoomEnabled &&
      (!existingMeeting.zid || explicitHostChange);

    // Pure/cheap (no DB) -- only decides which claims to lock below. The actual pool-host
    // resolution runs on `tx`, after every pool host is locked, inside the transaction (see the
    // zoomHost-resolution block further down) -- same reasoning as write/meeting/route.ts, closes
    // #360's TOCTOU gap.
    const needsAutoHost = needsNewHost && !newMeeting.zoomHost;

    let resolvedHost: string | null = null;
    let hostSyncError: string | null = null;

    // License-dependent per-host capacities, resolved BEFORE the locked transaction below — a
    // Zoom API round trip while pool advisory locks are held would extend lock hold time by an
    // external call's latency (cached 12h, so this is usually a no-op; see services/zoom.ts).
    const hostCapacities = await getZoomHostCapacities();

    // Everything from the conflict check through the Meeting(+RecurrencePattern) write runs
    // inside one transaction, guarded by a single lockResourceClaims call -- this closes the
    // check-then-write race (two concurrent requests could both pass the conflict check before
    // either wrote, and both succeed), the same fix as write/meeting/route.ts, now including
    // #360's pool-auto-assignment gap (every zoomHostPool candidate locked here too). Explicit
    // timeout: with the whole pool now locked and resolved in-transaction, lock-wait time under
    // real pool contention is no longer bounded by Prisma's 5s default -- 10s is a conservative
    // starting point pending the real measurement in ithaca-recovery-zoom-host-pool-race-plan.md.
    // maxWait raised alongside it for the same reason: every concurrent auto-assign request now
    // holds a pooled connection for its full lock wait, so a burst of them can exhaust Prisma's
    // default 2s connection-acquisition budget before a queued request even starts waiting on the
    // lock itself.
    let updatedMeeting: Meeting;
    try {
      updatedMeeting = await prisma.$transaction(async (tx) => {
        const claims: ResourceClaim[] = [];
        if (newMeeting.room) claims.push({ type: "room", value: newMeeting.room });
        if (newMeeting.zoomRoom) claims.push({ type: "zoomRoom", value: newMeeting.zoomRoom });
        if (newMeeting.zoomHost) claims.push({ type: "zoomHost", value: newMeeting.zoomHost });
        if (needsAutoHost) {
          for (const host of zoomHostPool) claims.push({ type: "zoomHost", value: host });
        }
        await lockResourceClaims(tx, claims);

        // Blocks the save outright on a room/zoomRoom collision, or an explicit zoomHost
        // reassignment that collides with another meeting's -- distinct from the pool-auto-
        // assignment path above, which defers the calendar publish and stores the error on the
        // meeting instead of rejecting the request (there's no "other host to pick instead" for
        // a plain pool-exhaustion the way there is for a room or an explicit host choice).
        // confirmOverride only bypasses this block, not the pool's handling. Deliberately
        // scoped to explicitHostChange, not bare newMeeting.zoomHost -- an edit that leaves the
        // Zoom Host dropdown on the meeting's own already-assigned host must not re-trigger this
        // check just because the field happens to be populated in the resubmitted form.
        if (!confirmOverride) {
          const conflictRows: ConflictRow[] = [];
          if (newMeeting.room) {
            conflictRows.push(...await findResourceConflictRows("room", newMeeting.room, candidate, tx, { excludeMid: mid }));
          }
          if (newMeeting.zoomRoom) {
            conflictRows.push(...await findResourceConflictRows("zoomRoom", newMeeting.zoomRoom, candidate, tx, { excludeMid: mid }));
          }
          if (explicitHostChange && newMeeting.zoomHost) {
            conflictRows.push(...await findResourceConflictRows(
              "zoomHost", newMeeting.zoomHost, candidate, tx,
              { excludeMid: mid, includeSuspended: true, capacity: hostCapacities[newMeeting.zoomHost] ?? 1 },
            ));
          }
          if (conflictRows.length > 0) {
            throw new ResourceConflictAbort(conflictRows);
          }
        }

        // The specific pool host an explicit pick collided with (kept even though resolvedHost
        // stays null) -- see the attemptedZoomHost field comment in schema.prisma for why.
        let attemptedZoomHost: string | null = null;
        if (needsNewHost) {
          if (newMeeting.zoomHost) {
            // A conflicting explicitHostChange is already blocked with a 409 above unless
            // confirmOverride was set. This branch also runs, non-blocking, for the other
            // needsNewHost case (the meeting never had a zid yet, but the client still picked a
            // specific host rather than leaving it to auto-assign) -- either way, a real
            // conflict here is treated the same as pool exhaustion below: nothing gets written
            // to the external Zoom API, and the calendar publish is deferred until an admin
            // picks a different host or the conflict clears.
            // Only re-query when the blocking check above didn't already prove this exact
            // field/value/candidate clean -- that's true only when !confirmOverride AND
            // explicitHostChange (the blocking check's own zoomHost gating condition); the
            // never-had-a-zid case never had this value checked yet, so it still needs a real
            // query even when !confirmOverride.
            const alreadyCheckedClean = !confirmOverride && explicitHostChange;
            const conflicts = alreadyCheckedClean
              ? []
              : await findResourceConflicts(
                  "zoomHost", newMeeting.zoomHost, candidate, tx,
                  { excludeMid: mid, includeSuspended: true, capacity: hostCapacities[newMeeting.zoomHost] ?? 1 },
                );
            if (conflicts.length === 0) {
              resolvedHost = newMeeting.zoomHost;
            } else {
              hostSyncError = "This time conflicts with another meeting using the same Zoom host.";
              attemptedZoomHost = newMeeting.zoomHost;
            }
          } else {
            const poolResolvedHost = await resolveZoomHost(candidate, tx, { excludeMid: mid, capacities: hostCapacities });
            resolvedHost = poolResolvedHost;
            hostSyncError = poolResolvedHost
              ? null
              : "No Zoom host available for this meeting's schedule (pool exhausted).";
          }
        }

        return tx.meeting.update({
          where: {
            mid: mid,
          },
          data: {
            ...meetingFields,
            // Server-managed provenance, like creator at create time -- who last saved an edit.
            lastEditedBy: auth.user?.email ?? null,
            // Postgres' Json columns reject a literal `null` on write (needs the Prisma.DbNull
            // sentinel for a real SQL NULL) -- Mongo's connector accepted plain `null` here directly.
            // Left `undefined` when the client didn't send the field at all (the normal case --
            // this is server-managed, updated below by syncUpdatedMeeting) so this update doesn't
            // touch/clear the column; only an explicit `null` maps to a real clear.
            googleCalendarEventIds:
              meetingFields.googleCalendarEventIds === null ? Prisma.DbNull : meetingFields.googleCalendarEventIds,
            ...(needsNewHost
              ? {
                  zoomHost: resolvedHost,
                  attemptedZoomHost,
                  ...(hostSyncError ? { zoomSyncStatus: 'error', zoomSyncError: hostSyncError } : {}),
                }
              : !zoomEnabled
                ? { attemptedZoomHost: null }
                : {}),
            recurrencePattern: recurrencePattern
              ? {
                  upsert: {
                    update: {
                      type: recurrencePattern.type,
                      startDate: recurrencePattern.startDate,
                      endDate: calculatedEndDate,
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
                      endDate: calculatedEndDate,
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

    // Same excludedDates fallback as `candidate` above (the BUG FIX comment there), applied to
    // what actually reaches buildEventBody this time: the client payload's recurrencePattern
    // doesn't reliably resubmit excludedDates (the form doesn't manage per-occurrence deletions),
    // and the DB upsert above deliberately never touches that column -- so without this, a plain
    // whole-series field edit would serialize the calendar body from an effectively-empty
    // excludedDates and silently resurrect every occurrence a prior 'this'-scope edit/delete had
    // EXDATE'd on Google Calendar, while the app itself still hides them (BUG A).
    const newMeetingForSync: IMeeting = {
      ...newMeeting,
      recurrencePattern: recurrencePattern
        ? {
            ...recurrencePattern,
            excludedDates: recurrencePattern.excludedDates ?? existingMeeting.recurrencePattern?.excludedDates ?? [],
          }
        : null,
    };

    // GCal/Zoom sync runs after the response is sent — see syncUpdatedMeeting above. Caught here
    // so a throw mid-sync (as opposed to a handled failure, which syncUpdatedMeeting already
    // persists as an error status itself) doesn't vanish as a silent unhandled rejection,
    // leaving the meeting's sync status at whatever it was before this run. Only reachable from
    // a throw at-or-before syncUpdatedMeeting's googleSyncStatus write (its trailing Zoom-status
    // write has its own local try/catch specifically so a Zoom-side failure there can't reach
    // here and overwrite an already-correct googleSyncStatus) -- so marking googleSyncStatus
    // 'error' here is always safe, and zoomSyncStatus is marked too since a crash this early
    // means whatever Zoom-side state exists can't be trusted as accurate either.
    after(
      syncUpdatedMeeting(mid, newMeetingForSync, existingMeeting, auth.accessToken, resolvedHost, hostSyncError)
        .catch(async (error) => {
          console.error("syncUpdatedMeeting threw:", error);
          try {
            await prisma.meeting.update({
              where: { mid },
              data: {
                googleSyncStatus: 'error',
                googleSyncError: "Sync job failed unexpectedly.",
                ...(zoomEnabled ? { zoomSyncStatus: 'error' as const, zoomSyncError: "Sync job failed unexpectedly." } : {}),
              },
            });
          } catch (persistError) {
            console.error("Failed to persist sync failure status:", persistError);
          }
        }),
    );

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export { updateMeeting as PUT };
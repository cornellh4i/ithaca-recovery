import { randomUUID } from "crypto";
import { Meeting, RecurrencePattern, SuspensionPeriod, Prisma, Role } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { requireRole } from "../../../../services/auth";
import { IMeeting } from "../../../../types/models";
import {
  createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, reconcileMeetingCalendars,
  calendarIdsForMeeting,
} from "../../../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomHostCapacities, getZoomMeetingCredentials, getZoomMeetingInvitation, rehostZoomMeeting, resolveZoomHost, zoomHostPool, zoomRoomCalendarId } from "../../../../services/zoom";
import { findResourceConflicts, findResourceConflictRows, ConflictRow, ResourceConflictAbort } from "../../../../util/meetings/resourceOverlap";
import { lockResourceClaims, ResourceClaim } from "../../../../util/meetings/resourceLocks";
import { meetingSchema, editScopeSchema, linkedScheduleSchema, LinkedScheduleInput } from "../../../../util/meetings/meetingValidation";
import {
  linkedFamilyLoader, LinkedFamilyLoader, LinkedFamilyMeeting, getLinkedFamily, familyMembers,
  canLinkSchedule, availableModesFor, claimedDaysFor, isZoomBearing, deriveLinkedScheduleStart,
  LINKED_SCHEDULE_CAP,
} from "../../../../util/meetings/linkedSchedules";
import { isSharedZoomScheduleCompatible } from "../../../../util/meetings/sharedZoomSchedule";
import { reconcilePendingResume, tearDownPendingResumeSeries } from "../../../../util/meetings/suspension";
import { calculateEndDateFromOccurrences } from "../../../../util/meetings/meetingOccurrences";
import { isConvertETToUTCValidationError } from "../../../../util/date/timeUtils";
import { EditScope, countOccurrencesBefore, exclusionInstant, trimmedEndDate, isLiveOccurrence, rootSplitMid, toETDateStr } from "../../../../util/meetings/editScope";
import { prisma } from "../../../../lib/prisma";

// Both ways an explicit host change can be refused on a Zoom meeting several rows share: Zoom
// itself rejecting the in-place transfer, and a recreate that would strand the siblings on the
// old meeting. Same outcome either way -- only the host move is dropped, the rest of the edit
// still applies -- so the admin-facing wording is the same too.
const SHARED_ZOOM_HOST_MOVE_REFUSED =
  "Couldn't move this shared Zoom meeting to the requested host; the host is unchanged.";

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
  // One family lookup for this whole sync: the Zoom PATCH/create below and every Google Calendar
  // write further down name the family the same way, so they must read the same rows. Whichever
  // gets there first pays for the query; an In-Person family member reaches only the calendar
  // half and loads it there.
  const loadFamily = linkedFamilyLoader(prisma, mid);

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
          zoomSyncError = SHARED_ZOOM_HOST_MOVE_REFUSED;
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

    // Shared-zid guard, same one the in-place transfer above already applies: a sibling row (same
    // group, second schedule variant) may still point at this Zoom meeting, and a recreate mints
    // a fresh meeting for THIS row alone -- the siblings would keep the old one, splitting the
    // family across two real Zoom meetings. So a shared Zoom meeting refuses the recreate the same
    // way it refuses a transfer Zoom rejects: keep the existing zid/link/passcode/host, report the
    // failed move, and let the rest of the edit (the room move below, the schedule PATCH, the
    // calendar reconcile) proceed normally. Only rehostFellBackToRecreate is already sibling-free
    // by construction; the other reason (a host change bundled with a room change) reaches here
    // with siblings intact.
    const recreateSplitsFamily = needsRecreate && !!zid && existingMeeting.zoomManaged &&
      (await prisma.meeting.count({ where: { zid, deletedAt: null, mid: { not: mid } } })) > 0;
    if (recreateSplitsFamily) {
      zoomSynced = false;
      zoomSyncError = SHARED_ZOOM_HOST_MOVE_REFUSED;
    }
    const recreateZoom = needsRecreate && !recreateSplitsFamily;

    if (recreateZoom || roomChanged) {
      // Only a genuine recreate reason ever tears down the Zoom meeting itself -- a pure room
      // change (no recreate reason) leaves it running untouched under its existing zid/host, the
      // same way an unmanaged meeting's room change already did (host changes were already
      // 422'd upstream for those, so needsRecreate can never be true there).
      if (recreateZoom && zid && existingMeeting.zoomManaged) {
        const ok = await deleteZoomMeeting(zid);
        if (!ok) zoomSynced = false;
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
      if (recreateZoom && existingMeeting.zoomManaged) {
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
        // through so a managed PATCH keeps the meeting's established Zoom name (a null one
        // stays null, so an auto topic is recomputed from the family below rather than pinned).
        // The whole linked-schedule family rides along so the PATCH sends the union schedule
        // (#513) and the family's own Zoom name, not this row's narrowed view of either.
        const family = existingMeeting.zoomManaged ? await loadFamily(zid) : [];
        const ok = existingMeeting.zoomManaged
          ? await updateZoomMeeting(zid, { ...newMeeting, zoomTopic: existingMeeting.zoomTopic }, family)
          : true;
        if (!ok) zoomSynced = false;
        // A PATCH that pushed a new custom passcode just made Zoom rewrite join_url's ?pwd= --
        // adopt the rewritten credentials BEFORE the calendar writes below, or every event
        // (whose description embeds zoomLink) republishes the now-dead old link. A failed
        // fetch keeps the stored values; the next Retry sync adopts them then.
        if (ok && existingMeeting.zoomManaged
          && newMeeting.zoomCustomPasscode
          && newMeeting.zoomCustomPasscode !== existingMeeting.zoomPasscode) {
          const liveCredentials = await getZoomMeetingCredentials(zid);
          if (liveCredentials?.joinUrl) {
            zoomLink = liveCredentials.joinUrl;
            zoomPasscode = liveCredentials.passcode;
          }
        }
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
        // No zid to group by here (this row either never had one or just had it torn down), so
        // the family is whatever linkedToMid says -- enough for the fresh meeting to be minted
        // with the family's union schedule and Zoom name rather than a name it has to be
        // renamed out of on the next PATCH.
        const family = await loadFamily(null);
        const created = await createZoomMeeting(newMeeting, host, family);
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
        const family = await loadFamily(zid);
        if (zoomCalendarEventId) {
          const { ok, error } = await updateCalendarEvent(accessToken, zoomCalendarEventId, meetingWithZoomLink, calId, zoomLink, family);
          if (!ok) {
            zoomSynced = false;
            zoomSyncError = zoomSyncError ?? error ?? "Zoom meeting's calendar event failed to update.";
          }
        } else {
          const { id: eventId, error } = await createCalendarEvent(accessToken, meetingWithZoomLink, calId, zoomLink, family);
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
      await loadFamily(zid),
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

// Runs after the response is sent — rewrites one existing meeting's Google Calendar events in
// place from its current stored state. Two callers, same job: the parent of a scoped edit
// (whose recurrence was just trimmed/excluded) and every other member of a linked-schedule
// family a new schedule just joined (whose event TITLE now names a family it didn't before --
// see handleLinkedScheduleCreate). Described below from the scoped-edit case, which is the one
// with the subtleties.
//
// A full-body rewrite of each configured calType event from the meeting's POST-WRITE
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
// suspended early-return above. Persists googleSyncStatus/googleSyncError for the parent so a
// failed rewrite gets the ⚠ badge/retry prompt instead of silently leaving DB and Google
// disagreeing about the trim/exclusion that already committed -- same contract as every other
// Google write (technical-decisions.md's "API failure ⇒ googleSyncStatus 'error'"). The
// suspended early-return above deliberately skips this write too -- that deferral is intentional
// (status stays whatever it already was), not a failure to report.
async function republishMeetingCalendars(
  mid: string,
  status: string,
  accessToken: string | undefined,
  calendarIds: Record<string, string>,
  eventIds: Record<string, string>,
  meetingForCalendar: IMeeting,
  zoomCalendarEventId: string | null,
  zoomRoom: string | null,
  loadFamily: LinkedFamilyLoader,
): Promise<void> {
  if (!accessToken || status === 'Suspended') return;
  let synced = true;
  let syncError: string | null = null;
  // The parent may be one schedule of a linked family, whose event title names every schedule --
  // rewriting its body without the family would quietly rename it back to its own mode alone.
  const family = await loadFamily(meetingForCalendar.zid ?? null);
  for (const [cat, calId] of Object.entries(calendarIds)) {
    const eventId = eventIds[cat];
    if (!eventId) {
      // A configured category with no stored event ID (most likely a previously-failed sync
      // that never got an ID to rewrite) isn't a no-op -- it's still divergent from what the
      // pattern now says, and silently continuing past it would report 'synced' while that
      // calendar never got touched at all.
      synced = false;
      syncError = syncError ?? `Missing Google Calendar event ID for "${cat}".`;
      continue;
    }
    const { ok, error } = await updateCalendarEvent(accessToken, eventId, meetingForCalendar, calId, undefined, family);
    if (!ok) {
      synced = false;
      syncError = syncError ?? error ?? "Failed to update the calendar event.";
    }
  }
  // A null zoomLink here would fall back to buildEventBody's street-address default as this
  // event's `location` (see the locationOverride comment there) -- publishing that onto a
  // Zoom-Room calendar breaks the room hardware's one-touch join detection, which keys off a
  // real Zoom URL. Only rewrite when there's still a real link to publish.
  if (zoomCalendarEventId && zoomRoom && meetingForCalendar.zoomLink) {
    const calId = zoomRoomCalendarId[zoomRoom];
    if (calId) {
      const { ok, error } = await updateCalendarEvent(accessToken, zoomCalendarEventId, meetingForCalendar, calId, meetingForCalendar.zoomLink, family);
      if (!ok) {
        synced = false;
        syncError = syncError ?? error ?? "Failed to update the Zoom-Room calendar event.";
      }
    }
  }
  await prisma.meeting.update({
    where: { mid },
    data: { googleSyncStatus: synced ? 'synced' : 'error', googleSyncError: synced ? null : syncError },
  });
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
  loadFamily: LinkedFamilyLoader,
): Promise<void> {
  // Defense in depth, same guard as syncUpdatedMeeting's -- the caller always creates a
  // split-off row with status: 'Active' (it has no suspension history of its own), so this
  // should never actually trigger, but a suspended meeting's calendar events must never be
  // published regardless of how that status got here.
  if (meetingData.status === 'Suspended') return;

  const zoomEnabled = meetingData.modeType === 'Hybrid' || meetingData.modeType === 'Remote';
  const meetingForSync: IMeeting = { ...meetingData, isRecurring };
  // The split-off row is a lineage of its parent, not a second mode, so it joins the family only
  // through the zid it inherited -- which is exactly how Zoom already sees it. Read from the
  // parent's loader: this sync runs concurrently with republishMeetingCalendars over the same
  // zid group, so the two share one lookup instead of issuing near-identical queries.
  const family = await loadFamily(meetingData.zid ?? null);

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
      const { id, error } = await createCalendarEvent(accessToken, meetingForSync, calId, undefined, family);
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
      const { id: eventId, error } = await createCalendarEvent(accessToken, meetingForSync, calId, meetingData.zoomLink, family);
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
  // The count the child row stores for a count-bounded split -- null whenever the payload is
  // endDate-bounded (or the split isn't recurring), in which case the payload's own value (if
  // any) is persisted as-is below.
  let childOccurrenceCount: number | null = null;
  if (isRecurringSplit) {
    const rp = newMeeting.recurrencePattern!;
    calculatedEndDate = rp.endDate ?? null;
    if (rp.numberOfOccurrences && !rp.endDate) {
      // Remaining-count semantics (matching Google Calendar's this-and-following on a COUNT
      // rule): an unchanged count-bounded pattern splits into "the rest of the series" -- a
      // 6-occurrence series split at its 3rd occurrence leaves a 4-occurrence child, keeping
      // the overall span the admin configured. Only when the admin actually edited the
      // schedule shape or the count itself does the submitted count run in full from the
      // split date -- they redefined the series, so their numbers win.
      const parentRp = existingMeeting.recurrencePattern;
      const sortedDays = (days: string[] | null | undefined) => [...(days ?? [])].sort().join(',');
      const shapeUnchanged = !!parentRp &&
        parentRp.type === rp.type &&
        (parentRp.interval ?? 1) === (rp.interval ?? 1) &&
        (parentRp.weekOfMonth ?? null) === (rp.weekOfMonth ?? null) &&
        (parentRp.dayOfMonth ?? null) === (rp.dayOfMonth ?? null) &&
        sortedDays(parentRp.daysOfWeek) === sortedDays(rp.daysOfWeek) &&
        parentRp.numberOfOccurrences === rp.numberOfOccurrences;
      childOccurrenceCount = shapeUnchanged
        ? Math.max(1, rp.numberOfOccurrences - countOccurrencesBefore(parentRp!, occurrenceDate))
        : rp.numberOfOccurrences;
      calculatedEndDate = calculateEndDateFromOccurrences(
        occurrenceDate, rp.daysOfWeek || [], childOccurrenceCount, rp.interval || 1,
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
          fellowship: newMeeting.fellowship ?? null,
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
          // Advanced Zoom settings describe the SHARED Zoom meeting the child inherits, not the
          // schedule -- copied from the stored row like zoomTopic/zoomManaged above.
          zoomCustomPasscode: existingMeeting.zoomCustomPasscode,
          zoomMeetAnytime: existingMeeting.zoomMeetAnytime,
          zoomJoinBeforeHost: existingMeeting.zoomJoinBeforeHost,
          splitFromMid,
          ...(isRecurringSplit
            ? {
                recurrencePattern: {
                  create: {
                    type: newMeeting.recurrencePattern!.type,
                    startDate: occurrenceDate,
                    endDate: calculatedEndDate,
                    // The remaining/child count computed above, so the edit form ("After N
                    // occurrences") and the endDate-driven popover/expansion agree on the
                    // child's span instead of contradicting each other.
                    numberOfOccurrences: childOccurrenceCount ?? newMeeting.recurrencePattern!.numberOfOccurrences ?? undefined,
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
  // One family lookup for both background syncs below: the split child inherits the parent's
  // zid, so keyed on the parent's mid it returns the superset both of them need -- and they
  // start concurrently, which is why the loader caches its in-flight promise.
  const loadFamily = linkedFamilyLoader(prisma, mid);

  after(
    republishMeetingCalendars(
      mid, existingMeeting.status, auth.accessToken, calendarIds, eventIds, parentForCalendar,
      existingMeeting.zoomCalendarEventId, existingMeeting.zoomRoom, loadFamily,
    ).catch((error) => console.error("republishMeetingCalendars threw:", error)),
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
      loadFamily,
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

// Runs after the response is sent — the new linked row's own half of the create: its Google
// Calendar events (and its Zoom-Room event, if any), via the same publish a split-off row gets.
// The one addition is the In-Person-anchor case: the family had no Zoom meeting to inherit, so
// this row mints it -- with the family, so it is born holding the union schedule and the
// family's name -- and becomes the family's zid holder. Every other case inherits the anchor's
// zid and makes no Zoom API call at all.
async function syncLinkedSchedule(
  newMid: string,
  linkedMeeting: IMeeting,
  accessToken: string | undefined,
  loadFamily: LinkedFamilyLoader,
  // Non-null only when this row mints the family's Zoom meeting; `host` is the pool host already
  // resolved and persisted synchronously in handleLinkedScheduleCreate (null when the pool was
  // exhausted, with `syncError` saying so).
  provision: { host: string | null; syncError: string | null } | null,
): Promise<void> {
  let meeting = linkedMeeting;

  if (provision) {
    if (!provision.host) {
      // Same contract as every other Zoom-blocked publish: nothing is published with a missing
      // join link, and "Retry sync" picks this row back up once a host frees up.
      await prisma.meeting.update({
        where: { mid: newMid },
        data: {
          googleSyncStatus: 'pending',
          zoomSyncStatus: 'error',
          zoomSyncError: provision.syncError ?? "No Zoom host available for this meeting's schedule (pool exhausted).",
        },
      });
      return;
    }
    const created = await createZoomMeeting(meeting, provision.host, await loadFamily(null));
    if (!created) {
      await prisma.meeting.update({
        where: { mid: newMid },
        data: { googleSyncStatus: 'pending', zoomSyncStatus: 'error', zoomSyncError: "Failed to create the Zoom meeting." },
      });
      return;
    }
    const zoomInvitation = await getZoomMeetingInvitation(created.zid);
    await prisma.meeting.update({
      where: { mid: newMid },
      data: { zid: created.zid, zoomLink: created.zoomLink, zoomPasscode: created.zoomPasscode, zoomInvitation },
    });
    meeting = { ...meeting, zid: created.zid, zoomLink: created.zoomLink, zoomPasscode: created.zoomPasscode };
  }

  await syncSplitMeeting(newMid, meeting, true, accessToken, loadFamily);
}

// Runs after the response is sent — the REST of the family's half of a linked-schedule create.
// A family's external name is derived from all of its schedules ("Group - Hybrid Mon-Fri - Zoom
// Only Sat"), so the moment a second schedule joins, every existing member's copy of that name
// is stale: the shared Zoom meeting needs the widened union schedule and the new topic, and each
// existing member's Google Calendar events need a full rewrite to pick up the new title. Without
// this fan-out those events would keep advertising the old single-schedule name until something
// else happened to touch them.
async function syncLinkedScheduleFamily(
  // The family as it stood BEFORE the create -- every member except the new row.
  members: LinkedFamilyMeeting[],
  accessToken: string | undefined,
  loadFamily: LinkedFamilyLoader,
  // The shared Zoom meeting the new schedule joined, when there is one to widen. Null when the
  // new row is minting the family's Zoom meeting itself (createZoomMeeting is handed the family
  // there, so there is nothing left to correct) or when no member uses Zoom at all.
  patchZid: string | null,
): Promise<void> {
  if (patchZid) {
    // Unmanaged Zoom meetings are never PATCHed -- the stored link is the contract (see
    // syncUpdatedMeeting).
    const holder = members.find((member) => member.zid === patchZid && member.zoomManaged);
    if (holder) {
      const ok = await updateZoomMeeting(patchZid, holder as unknown as IMeeting, await loadFamily(patchZid));
      // Persisted either way, like every other Zoom write: a holder already carrying a stale
      // zoomSyncStatus 'error' (from an earlier failed sync) would otherwise keep the calendar's
      // ⚠ badge after this PATCH actually succeeded.
      await prisma.meeting.update({
        where: { mid: holder.mid },
        data: ok
          ? { zoomSyncStatus: 'synced', zoomSyncError: null }
          : {
              zoomSyncStatus: 'error',
              zoomSyncError: "Couldn't update the shared Zoom meeting for the newly linked schedule.",
            },
      });
    }
  }

  for (const member of members) {
    await republishMeetingCalendars(
      member.mid,
      member.status,
      accessToken,
      calendarIdsForMeeting(member.calType ?? []),
      (member.googleCalendarEventIds ?? {}) as Record<string, string>,
      member as unknown as IMeeting,
      member.zoomCalendarEventId,
      member.zoomRoom,
      loadFamily,
    );
  }
}

// Whether this payload asks to change the anchor row itself, on top of adding a schedule to it.
// Compares only what the meeting form can actually edit: `creator` is server-managed and
// `group` has no input at all (the form posts a placeholder for both), so a difference there is
// never an admin's edit. A payload with no `recurrencePattern` makes no claim about the
// recurrence either -- this branch never deletes one, unlike the whole-series path below.
function submitsAnchorEdits(
  existing: Meeting & { recurrencePattern: RecurrencePattern | null },
  submitted: IMeeting,
): boolean {
  const text = (value: string | null | undefined) => value ?? "";
  if (
    submitted.title !== existing.title ||
    text(submitted.description) !== text(existing.description) ||
    text(submitted.email) !== text(existing.email) ||
    submitted.modeType !== existing.modeType ||
    text(submitted.room) !== text(existing.room) ||
    text(submitted.zoomRoom) !== text(existing.zoomRoom) ||
    text(submitted.status) !== text(existing.status) ||
    submitted.isRecurring !== existing.isRecurring ||
    new Date(submitted.startDateTime).getTime() !== existing.startDateTime.getTime() ||
    new Date(submitted.endDateTime).getTime() !== existing.endDateTime.getTime() ||
    [...submitted.calType].sort().join("|") !== [...existing.calType].sort().join("|") ||
    text(submitted.fellowship) !== text(existing.fellowship)
  ) {
    return true;
  }
  // Same definition of "an explicit reassignment" the whole-series path's explicitHostChange
  // uses: a blank/"Automatic" selection, or resubmitting the meeting's own host, is not one.
  const submittedHost = (submitted.zoomHost ?? "").trim();
  if (submittedHost && submittedHost.toLowerCase() !== (existing.zoomHost ?? "").trim().toLowerCase()) return true;

  const pattern = submitted.recurrencePattern;
  if (!pattern) return false;
  const stored = existing.recurrencePattern;
  if (!stored) return true;
  // A count-bounded pattern is STORED with its count already resolved into a real endDate,
  // while the form resubmits it as a still-null endDate plus the count -- so the submitted one
  // has to be resolved the same way the whole-series path resolves it before comparing.
  const submittedEndDate = pattern.endDate ?? (pattern.numberOfOccurrences
    ? calculateEndDateFromOccurrences(
        pattern.startDate, pattern.daysOfWeek ?? [], pattern.numberOfOccurrences,
        pattern.interval || 1, pattern.type, pattern.weekOfMonth ?? null, pattern.dayOfMonth ?? null,
      )
    : null);
  return (
    pattern.type !== stored.type ||
    new Date(pattern.startDate).getTime() !== stored.startDate.getTime() ||
    (submittedEndDate ? new Date(submittedEndDate).getTime() : null) !== (stored.endDate?.getTime() ?? null) ||
    (pattern.numberOfOccurrences ?? null) !== (stored.numberOfOccurrences ?? null) ||
    (pattern.interval || 1) !== stored.interval ||
    (pattern.weekOfMonth ?? null) !== (stored.weekOfMonth ?? null) ||
    (pattern.dayOfMonth ?? null) !== (stored.dayOfMonth ?? null) ||
    (pattern.daysOfWeek ?? []).join("|") !== (stored.daysOfWeek ?? []).join("|")
  );
}

// Handles a `linkedSchedule` block: adds a SECOND weekly schedule -- a different mode on
// different weekdays -- to an existing recurring meeting, served by the family's one Zoom
// meeting (util/meetings/linkedSchedules.ts). Modeled on handleScopedEdit, minus the parent
// trim: the anchor row itself is not touched, only read.
async function handleLinkedScheduleCreate(
  auth: { accessToken?: string; user?: { email?: string | null } | null },
  existingMeeting: Meeting & { recurrencePattern: RecurrencePattern | null },
  newMeeting: IMeeting,
  linkedSchedule: LinkedScheduleInput,
): Promise<Response> {
  const confirmOverride = !!newMeeting.confirmOverride;
  // This branch reads the anchor row and never writes it, so any edit to the anchor's own
  // fields in the same payload would be accepted with a 200 and applied nowhere. Refused
  // instead of silently dropped -- the two writes are separate requests.
  if (submitsAnchorEdits(existingMeeting, newMeeting)) {
    return NextResponse.json(
      { error: "Save this meeting's own changes before adding a linked schedule -- they can't be submitted together." },
      { status: 400 },
    );
  }

  const family = await getLinkedFamily(prisma, existingMeeting.mid);
  if (!family) {
    return NextResponse.json({ error: `Meeting with ID ${existingMeeting.mid} not found` }, { status: 404 });
  }
  // Resolved from either member, so this is the family's own root even if the request targeted
  // an already-linked row -- and by the cap check below, the only member whenever this request
  // goes on to write anything.
  const anchor = family.anchor;

  if (!anchor.isRecurring || !anchor.recurrencePattern) {
    return NextResponse.json(
      { error: "A linked schedule can only be added to a recurring meeting." },
      { status: 400 },
    );
  }
  if (anchor.recurrencePattern.type !== 'weekly') {
    return NextResponse.json(
      { error: "A linked schedule can only be added to a weekly meeting." },
      { status: 400 },
    );
  }
  if (!canLinkSchedule(family)) {
    return NextResponse.json(
      { error: `This meeting already runs ${LINKED_SCHEDULE_CAP} schedules; no more can be linked.` },
      { status: 400 },
    );
  }
  const availableModes = availableModesFor(family);
  if (!availableModes.includes(linkedSchedule.modeType)) {
    return NextResponse.json(
      { error: `A linked schedule must use a mode this meeting doesn't already run (${availableModes.join(", ")}).` },
      { status: 400 },
    );
  }
  const linkedDays = linkedSchedule.recurrencePattern.daysOfWeek ?? [];
  if (linkedDays.length === 0) {
    return NextResponse.json(
      { error: "A linked schedule must meet on at least one day of the week." },
      { status: 400 },
    );
  }
  // Disjoint weekdays are a hard requirement, not a preference: Zoom holds the family's schedules
  // as ONE union of weekdays, so a day claimed twice silently collapses into a single occurrence.
  const claimedDays = claimedDaysFor(family);
  const overlappingDays = linkedDays.filter((day) => claimedDays.includes(day));
  if (overlappingDays.length > 0) {
    return NextResponse.json(
      { error: `This meeting already meets on ${overlappingDays.join(", ")}; a linked schedule must run on other days.` },
      { status: 400 },
    );
  }

  let derived: { startDateTime: Date; endDateTime: Date; patternStartDate: Date } | null;
  try {
    derived = deriveLinkedScheduleStart(anchor, linkedDays);
  } catch (error) {
    // The anchor's time of day doesn't exist on the linked schedule's first date (the DST
    // spring-forward gap) -- the admin's own input, not a server fault.
    if (isConvertETToUTCValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  if (!derived) {
    return NextResponse.json(
      { error: "The requested days produce no occurrence inside this meeting's series." },
      { status: 400 },
    );
  }
  const { startDateTime, endDateTime, patternStartDate } = derived;

  // Everything below is copied from the anchor, never read from the payload -- see
  // linkedScheduleBlockSchema's comment. A count-bounded anchor gives the linked schedule the
  // same count, resolved into its OWN end date because its weekdays reach that count elsewhere.
  // Counted from patternStartDate, not the row's start instant: see deriveLinkedScheduleStart.
  const pattern = anchor.recurrencePattern;
  const numberOfOccurrences = pattern.endDate ? null : pattern.numberOfOccurrences;
  const endDate = pattern.endDate ?? (numberOfOccurrences
    ? calculateEndDateFromOccurrences(patternStartDate, linkedDays, numberOfOccurrences, pattern.interval, 'weekly', null, null)
    : null);

  const needsZoom = isZoomBearing({ modeType: linkedSchedule.modeType });
  // The family's Zoom identity is inherited whole, never re-provisioned -- one Zoom meeting per
  // family. An In-Person linked row gets none of it; an In-Person ANCHOR has none to give, so a
  // Zoom-bearing linked row mints the family's Zoom meeting itself and becomes its zid holder
  // (linkedToMid still keys the family, which is exactly why the family isn't keyed on zid).
  const inheritsZoom = needsZoom && isZoomBearing(anchor);
  const provisionsZoom = needsZoom && !inheritsZoom;
  const inheritedZoomHost = inheritsZoom ? anchor.zoomHost : null;

  const candidate = {
    mid: linkedSchedule.mid,
    title: anchor.title,
    room: linkedSchedule.room ?? "",
    zoomRoom: linkedSchedule.zoomRoom ?? null,
    zoomHost: inheritedZoomHost,
    status: 'Active',
    calType: anchor.calType,
    startDateTime,
    endDateTime,
    isRecurring: true,
    recurrencePattern: {
      type: 'weekly',
      startDate: patternStartDate,
      endDate,
      interval: pattern.interval,
      daysOfWeek: linkedDays,
      weekOfMonth: null,
      dayOfMonth: null,
      excludedDates: [],
    },
  };

  // Backstop for a family Zoom can't hold as one series (a member that diverged in interval,
  // time of day or duration since it was created). Everything the check reads is derived above,
  // so a request that reaches here normally passes -- but a family it rejects would have its
  // Zoom schedule silently frozen from then on, which is worth refusing outright.
  if (!isSharedZoomScheduleCompatible([...familyMembers(family), candidate])) {
    return NextResponse.json(
      { error: "This meeting's schedules can't be served by one Zoom meeting (they must share an interval, time of day and duration)." },
      { status: 400 },
    );
  }

  // License-dependent per-host capacities, resolved before the locked transaction below -- same
  // reasoning as every other path (a Zoom API round trip while advisory locks are held would
  // extend lock hold time by an external call's latency; cached 12h, usually a no-op).
  const hostCapacities = await getZoomHostCapacities();

  let txResult: { createdMeeting: LinkedFamilyMeeting; resolvedHost: string | null; hostSyncError: string | null };
  try {
    txResult = await prisma.$transaction(async (tx) => {
      const claims: ResourceClaim[] = [];
      if (candidate.room) claims.push({ type: "room", value: candidate.room });
      if (candidate.zoomRoom) claims.push({ type: "zoomRoom", value: candidate.zoomRoom });
      if (inheritedZoomHost) claims.push({ type: "zoomHost", value: inheritedZoomHost });
      // Only the In-Person-anchor case ever picks a host here; every other case reuses the
      // family's, so no pool lock is needed (or wanted -- see the host-capacity note below).
      if (provisionsZoom) {
        for (const host of zoomHostPool) claims.push({ type: "zoomHost", value: host });
      }
      await lockResourceClaims(tx, claims);

      if (!confirmOverride) {
        const conflictRows: ConflictRow[] = [];
        // room/zoomRoom must NOT exclude the anchor -- same reasoning as handleScopedEdit's: the
        // anchor's own occurrences are live bookings of that room, and the two schedules only
        // avoid each other by weekday, which nothing here has verified about the ROOM.
        if (candidate.room) {
          conflictRows.push(...await findResourceConflictRows("room", candidate.room, candidate, tx, {}));
        }
        if (candidate.zoomRoom) {
          conflictRows.push(...await findResourceConflictRows("zoomRoom", candidate.zoomRoom, candidate, tx, {}));
        }
        // zoomHost DOES exclude the family: the inherited zid is ONE real Zoom booking the two
        // schedules share, not a second one to flag. Excluded by zid as well as by the anchor's
        // mid, because "rows of that one booking" is exactly what a shared zid means -- a
        // scoped-edit split child of the anchor holds the same zid without being a family
        // member, and would otherwise be reported as the family colliding with itself.
        // Belt-and-braces anyway -- the disjoint-weekday rule above already means the two
        // schedules' occurrences never overlap.
        if (inheritedZoomHost) {
          conflictRows.push(...await findResourceConflictRows(
            "zoomHost", inheritedZoomHost, candidate, tx,
            {
              excludeMid: anchor.mid, excludeZid: anchor.zid ?? undefined,
              includeSuspended: true, capacity: hostCapacities[inheritedZoomHost] ?? 1,
            },
          ));
        }
        if (conflictRows.length > 0) {
          throw new ResourceConflictAbort(conflictRows);
        }
      }

      // Host capacity is consumed only when this row actually mints a Zoom meeting. An inherited
      // zid re-uses the family's existing booking, so there is nothing to reserve -- mirrors
      // handleScopedEdit exactly.
      let resolvedHost: string | null = null;
      let hostSyncError: string | null = null;
      if (provisionsZoom) {
        resolvedHost = await resolveZoomHost(candidate, tx, { capacities: hostCapacities });
        hostSyncError = resolvedHost
          ? null
          : "No Zoom host available for this meeting's schedule (pool exhausted).";
      }

      const createdMeeting = await tx.meeting.create({
        data: {
          mid: linkedSchedule.mid,
          title: anchor.title,
          description: anchor.description,
          creator: auth.user?.email ?? anchor.creator,
          lastEditedBy: null,
          group: anchor.group,
          startDateTime,
          endDateTime,
          email: anchor.email,
          calType: anchor.calType,
          fellowship: anchor.fellowship ?? null,
          modeType: linkedSchedule.modeType,
          room: candidate.room,
          zoomRoom: candidate.zoomRoom,
          // A linked schedule always starts Active -- it has no suspension history of its own,
          // and must never inherit a suspended anchor's status.
          status: 'Active',
          isRecurring: true,
          linkedToMid: anchor.mid,
          // A second mode, not a division of the anchor's series -- the two lineage columns are
          // deliberately distinct (schema.prisma).
          splitFromMid: null,
          ...(inheritsZoom
            ? {
                zid: anchor.zid,
                zoomLink: anchor.zoomLink,
                zoomPasscode: anchor.zoomPasscode,
                zoomInvitation: anchor.zoomInvitation,
                zoomHost: anchor.zoomHost,
                zoomManaged: anchor.zoomManaged,
                // A pinned family name stays pinned for every member; a null one keeps meaning
                // "auto, recompute from the current family" (services/zoom.ts).
                zoomTopic: anchor.zoomTopic,
                // Advanced settings of the family's ONE Zoom meeting -- every member must agree.
                zoomCustomPasscode: anchor.zoomCustomPasscode,
                zoomMeetAnytime: anchor.zoomMeetAnytime,
                zoomJoinBeforeHost: anchor.zoomJoinBeforeHost,
              }
            : {}),
          ...(provisionsZoom
            ? {
                zoomHost: resolvedHost,
                ...(hostSyncError ? { zoomSyncStatus: 'error', zoomSyncError: hostSyncError } : {}),
              }
            : {}),
          recurrencePattern: {
            create: {
              type: 'weekly',
              startDate: patternStartDate,
              endDate,
              numberOfOccurrences: numberOfOccurrences ?? undefined,
              daysOfWeek: linkedDays,
              firstDayOfWeek: pattern.firstDayOfWeek,
              interval: pattern.interval,
              weekOfMonth: null,
              dayOfMonth: null,
              excludedDates: [],
            },
          },
        },
        include: { recurrencePattern: true },
      });

      return { createdMeeting, resolvedHost, hostSyncError };
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

  const { createdMeeting, resolvedHost, hostSyncError } = txResult;
  // The zid the family already holds, if any -- the shared Zoom meeting the new schedule joined.
  const familyZid = familyMembers(family).find((member) => isZoomBearing(member) && member.zid)?.zid ?? null;
  // One family lookup for both background syncs below -- keyed on the anchor, so it returns the
  // post-create family (both schedules) whichever of them asks for it first. Pinned to the
  // FAMILY's zid rather than whichever caller gets there first: the loader resolves its zid
  // argument once, on that first call, and an In-Person linked row would pin it to null --
  // dropping every other row of the same Zoom meeting (split children, legacy zid groups) from
  // the union the family PATCH is built from, silently narrowing Zoom's weekly_days (#513).
  const familyLoader = linkedFamilyLoader(prisma, anchor.mid);
  const loadFamily: LinkedFamilyLoader = () => familyLoader(familyZid);

  after(
    syncLinkedSchedule(
      createdMeeting.mid,
      createdMeeting as unknown as IMeeting,
      auth.accessToken,
      loadFamily,
      provisionsZoom ? { host: resolvedHost, syncError: hostSyncError } : null,
    ).catch(async (error) => {
      console.error("syncLinkedSchedule threw:", error);
      try {
        await prisma.meeting.update({
          where: { mid: createdMeeting.mid },
          data: { googleSyncStatus: 'error', googleSyncError: "Sync job failed unexpectedly." },
        });
      } catch (persistError) {
        console.error("Failed to persist linked-schedule sync failure status:", persistError);
      }
    }),
  );
  // The family's existing shared Zoom meeting needs the PATCH whether or not the new schedule
  // is Zoom-bearing: an In-Person member adds no days to the recurrence but still names itself
  // in the family's topic. Null only when this request just minted the Zoom meeting, since
  // createZoomMeeting was already handed the family.
  const patchZid = provisionsZoom ? null : familyZid;

  after(
    syncLinkedScheduleFamily(familyMembers(family), auth.accessToken, loadFamily, patchZid)
      .catch((error) => console.error("syncLinkedScheduleFamily threw:", error)),
  );

  return NextResponse.json({ ...anchor, linkedMid: createdMeeting.mid });
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

    // Parsed separately from meetingSchema too (see linkedScheduleBlockSchema's comment) --
    // present only when the request is adding a SECOND schedule to this meeting.
    const linkedParsed = linkedScheduleSchema.safeParse(rawBody);
    if (!linkedParsed.success) {
      return NextResponse.json({ error: "Invalid linked schedule", issues: linkedParsed.error.issues }, { status: 400 });
    }
    const linkedSchedule: LinkedScheduleInput | null = linkedParsed.data.linkedSchedule ?? null;
    // A linked schedule is a property of the whole series (a second weekly schedule of the same
    // meeting), so there is no coherent meaning for adding one to a single occurrence or to the
    // tail of a split -- reject the combination instead of silently applying one half of it.
    if (linkedSchedule && editScope !== 'all') {
      return NextResponse.json(
        { error: "A linked schedule applies to the whole series; editScope must be omitted or 'all'." },
        { status: 400 },
      );
    }

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

    if (linkedSchedule) {
      return handleLinkedScheduleCreate(auth, existingMeeting, newMeeting, linkedSchedule);
    }

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
      // Trimmed to match the client's isHostDirty normalization -- a trailing space must not
      // turn an unchanged host into a 400 the scope dialog never warned about.
      const scopedExplicitHostChange = (newMeeting.zoomHost ?? "").trim() !== "" &&
        (newMeeting.zoomHost ?? "").trim().toLowerCase() !== (existingMeeting.zoomHost ?? "").trim().toLowerCase();
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
      // 'thisAndFollowing' anchors the new tail series' pattern.startDate to occurrenceDate (the
      // clicked occurrence), not to newMeeting.startDateTime -- handleScopedEdit uses
      // occurrenceDate for the series start and newMeeting.startDateTime for the row's own
      // wall-clock time. Those only stay consistent if the client re-anchored the date field to
      // match occurrenceDate; an edited date field (a genuine date CHANGE, not a re-anchor)
      // would silently diverge the row's own date from the series it claims to start. Scope
      // 'this' is deliberately exempt -- editing the single occurrence's own date is the whole
      // point there.
      if (editScope === 'thisAndFollowing' && toETDateStr(newMeeting.startDateTime) !== toETDateStr(occurrenceDate)) {
        return NextResponse.json(
          { error: "date changes apply to a single event or the whole series" },
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
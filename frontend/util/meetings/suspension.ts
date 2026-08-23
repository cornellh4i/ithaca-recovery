import "server-only";
import { Meeting, RecurrencePattern, SuspensionPeriod } from "@prisma/client";
import { formatETDateString, isDstGapError } from "../date/timeUtils";
import { isDateSuspended, adjustOccurrenceToDate, firstOccurrenceOnOrAfter } from "./meetingOccurrences";
import { calendarIdsForMeeting, createCalendarEvent, deleteCalendarEvent } from "../../services/googleCalendar";
import { linkedFamilyLoader } from "./linkedSchedules";
import { IMeeting } from "../../types/models";
import { prisma } from "../../lib/prisma";

export type MeetingWithPattern = Meeting & { recurrencePattern: RecurrencePattern | null };
export type MeetingWithSuspensions = Meeting & {
  recurrencePattern: RecurrencePattern | null;
  suspensions: SuspensionPeriod[];
};
// Narrower than MeetingWithSuspensions -- getOpenSuspension/getUnresolvedSuspension only ever
// touch `suspensions`, so this lets callers with a partial `select` (e.g. the diagnostics route,
// which doesn't fetch every Meeting field) use them without widening their own query.
type HasSuspensions = { suspensions: SuspensionPeriod[] };

// The suspension row covering today, if any -- "currently suspended" is always this, never a
// stored flag. `null` if the meeting isn't suspended today (whether it never was, or a past
// suspension's `to` date has already passed). Sorted by `from` descending, same as
// getUnresolvedSuspension below -- normally there's at most one row covering today at all (the
// suspend route blocks creating a second unresolved one), but if that check is ever raced, both
// functions need to agree on which row wins rather than one picking array order and the other
// picking the most recent. Use this specifically when the question is "is this meeting hidden
// from the calendar right now" -- for "does this meeting have any unresolved suspension,
// including one scheduled to start later," see getUnresolvedSuspension below.
export const getOpenSuspension = (meeting: HasSuspensions, todayStr = formatETDateString(new Date())): SuspensionPeriod | null =>
  meeting.suspensions
    .filter((s) => isDateSuspended([s], todayStr))
    .sort((a, b) => b.from.getTime() - a.from.getTime())[0] ?? null;

// The most recent suspension that hasn't resolved yet -- either already open today, or scheduled
// to start on a future date (suspend/route.ts lets an admin schedule one ahead by clicking a
// future occurrence). Unlike getOpenSuspension, this doesn't require `from` to have arrived, so
// it's what "does this meeting have a suspension to show/manage" (Diagnostics' panel, the
// meeting popup's kebab, resume's own "what am I resuming or cancelling" lookup) should use --
// getOpenSuspension stays reserved for "is it actually hidden from the calendar today."
export const getUnresolvedSuspension = (meeting: HasSuspensions, todayStr = formatETDateString(new Date())): SuspensionPeriod | null =>
  meeting.suspensions
    .filter((s) => s.to === null || formatETDateString(new Date(s.to)) > todayStr)
    .sort((a, b) => b.from.getTime() - a.from.getTime())[0] ?? null;

// Lazy self-heal: if the meeting's most recent suspension pre-created a post-resume GCal series
// (resumeEventIds) and that series' start date has actually arrived, but nothing has promoted it
// into Meeting.googleCalendarEventIds yet, do that now. Cron-free by design -- this only needs to
// run the next time anything touches the meeting (update/delete/suspend/resume routes all call it
// right after fetching), and GCal's own recurrence engine already shows the pre-created series to
// the public regardless of whether our DB pointer has caught up.
export const reconcilePendingResume = async (meeting: MeetingWithSuspensions): Promise<Record<string, string>> => {
  const eventIds = (meeting.googleCalendarEventIds ?? {}) as Record<string, string>;
  const todayStr = formatETDateString(new Date());

  // Sorted by `from` descending -- if more than one period is somehow due and unpromoted at
  // once, the most recent one's event IDs are the ones actually live on Google Calendar.
  const pending = meeting.suspensions
    .filter((s) => !s.promoted && s.resumeEventIds && s.to && formatETDateString(new Date(s.to)) <= todayStr)
    .sort((a, b) => b.from.getTime() - a.from.getTime())[0];
  if (!pending) return eventIds;

  const resumeEventIds = pending.resumeEventIds as Record<string, string>;
  await prisma.$transaction([
    prisma.meeting.update({ where: { mid: meeting.mid }, data: { googleCalendarEventIds: resumeEventIds } }),
    prisma.suspensionPeriod.update({ where: { id: pending.id }, data: { promoted: true } }),
  ]);
  return resumeEventIds;
};

// Only the fields services/googleCalendar.ts's buildEventBody actually reads -- constructed
// explicitly rather than spreading the Prisma row, since Prisma's Meeting type doesn't line up
// field-for-field with IMeeting (e.g. googleCalendarEventIds is a JsonValue here, not a typed
// Record).
export function toCalendarMeeting(
  meeting: MeetingWithPattern,
  startDateTime: Date,
  endDateTime: Date,
): IMeeting {
  return {
    mid: meeting.mid,
    title: meeting.title,
    description: meeting.description,
    creator: meeting.creator,
    group: meeting.group,
    startDateTime,
    endDateTime,
    email: meeting.email,
    zoomRoom: meeting.zoomRoom,
    zoomLink: meeting.zoomLink,
    calType: meeting.calType,
    modeType: meeting.modeType,
    room: meeting.room,
    isRecurring: meeting.isRecurring,
    recurrencePattern: meeting.recurrencePattern
      ? { ...meeting.recurrencePattern, startDate: startDateTime }
      : null,
  };
}

// Pre-creates the GCal series/event a suspended meeting will resume into on `resumeDate`,
// without touching Meeting.googleCalendarEventIds (see reconcilePendingResume above for why) --
// shared by the suspend route's "Until X" option and the resume route's "Resume on X"
// (reschedule) option, since both are really the same operation: "this meeting is suspended,
// but should auto-resume on this future date."
export async function createPendingResumeSeries(
  meeting: MeetingWithPattern,
  accessToken: string | undefined,
  resumeDate: Date,
): Promise<{ resumeEventIds: Record<string, string>; error: string | null }> {
  if (!accessToken) return { resumeEventIds: {}, error: null };
  const requestedCats = meeting.calType ?? [];
  const calendarIds = calendarIdsForMeeting(requestedCats);
  const resumeEventIds: Record<string, string> = {};
  let error: string | null = null;
  // A suspended row may be one schedule of a linked family, whose event title names every
  // schedule -- pre-creating the resume series without the family would publish it under this
  // row's own mode alone, and it would stay wrong once promoted. Lazy: the early returns below
  // for "no upcoming occurrence" must stay genuine no-ops, query included.
  const loadFamily = linkedFamilyLoader(prisma, meeting.mid);
  // calendarIds silently drops any category whose GOOGLE_CALENDAR_* env var isn't configured --
  // only recorded once we know there's an occurrence worth syncing into (the early returns
  // below for "no upcoming occurrence" stay genuine no-ops, not a misconfiguration report).
  const recordUnconfiguredCat = () => {
    const unconfiguredCat = requestedCats.find((cat) => !calendarIds[cat]);
    if (unconfiguredCat) error = error ?? `Calendar for "${unconfiguredCat}" is not configured.`;
  };

  if (meeting.isRecurring && meeting.recurrencePattern) {
    const resumeDateStr = firstOccurrenceOnOrAfter(
      { ...meeting.recurrencePattern, daysOfWeek: meeting.recurrencePattern.daysOfWeek ?? [] },
      formatETDateString(resumeDate),
    );
    if (!resumeDateStr) return { resumeEventIds: {}, error: null };
    recordUnconfiguredCat();
    // adjustOccurrenceToDate throws if the resume occurrence's ET start/end time lands in the
    // DST spring-forward gap on this date (the one day/year that time doesn't exist) -- treated
    // as nothing to pre-create rather than crashing the whole suspend/resume request. Any other
    // error means a real bug and should propagate instead of being reported as this specific,
    // admin-facing message.
    let start: Date, end: Date;
    try {
      ({ start, end } = adjustOccurrenceToDate(meeting, resumeDateStr));
    } catch (err) {
      if (!isDstGapError(err)) throw err;
      // googleSyncError is shown verbatim in the admin UI (ViewMeeting's sync-status line) --
      // this is a reworded, admin-appropriate message, not convertETToUTC's internal one.
      return { resumeEventIds: {}, error: "Could not compute the resume time — it falls in a DST transition gap." };
    }
    const resumeMeeting = toCalendarMeeting(meeting, start, end);
    const family = await loadFamily(meeting.zid ?? null);
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const { id, error: createError } = await createCalendarEvent(accessToken, resumeMeeting, calId, undefined, family);
      if (id) resumeEventIds[cat] = id;
      else error = error ?? createError;
    }
  } else if (meeting.startDateTime > new Date()) {
    // One-time meeting: only worth pre-creating if the original occurrence hasn't happened yet
    // -- otherwise there's nothing meaningful to resume it into.
    recordUnconfiguredCat();
    const resumeMeeting = toCalendarMeeting(meeting, meeting.startDateTime, meeting.endDateTime);
    const family = await loadFamily(meeting.zid ?? null);
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const { id, error: createError } = await createCalendarEvent(accessToken, resumeMeeting, calId, undefined, family);
      if (id) resumeEventIds[cat] = id;
      else error = error ?? createError;
    }
  }

  return { resumeEventIds, error };
}

// Deletes every not-yet-promoted pre-created resume series still hanging off this meeting's
// suspension history -- a promoted row's resumeEventIds already equals what's live in
// Meeting.googleCalendarEventIds (torn down separately by the caller's own delete-all sync), so
// only unpromoted rows represent GCal events that would otherwise go orphaned. Shared by the
// delete route (removing a meeting must not leave a future series dangling on Google Calendar)
// and the resume route's reschedule path (picking a new resume date must not leave the
// previously-scheduled one behind).
export async function tearDownPendingResumeSeries(
  meeting: MeetingWithSuspensions,
  accessToken: string | undefined,
): Promise<void> {
  if (!accessToken) return;
  for (const suspension of meeting.suspensions) {
    if (suspension.promoted || !suspension.resumeEventIds) continue;
    const eventIds = suspension.resumeEventIds as Record<string, string>;
    // Resolved from the stored eventIds' own categories, not meeting.calType -- the meeting
    // may have been edited (categories added/removed) since this pending series was created,
    // and a category since dropped from calType would otherwise never be visited here, leaving
    // its event permanently orphaned on Google Calendar.
    const calendarIds = calendarIdsForMeeting(Object.keys(eventIds));
    for (const [cat, eventId] of Object.entries(eventIds)) {
      const calId = calendarIds[cat];
      if (calId) await deleteCalendarEvent(accessToken, eventId, calId);
    }
  }
}

import "server-only";
import { Meeting, RecurrencePattern, SuspensionPeriod } from "@prisma/client";
import { formatETDateString } from "./timeUtils";
import { isDateSuspended, adjustOccurrenceToDate, firstOccurrenceOnOrAfter } from "./meetingOccurrences";
import { calendarIdsForMeeting, createCalendarEvent, deleteCalendarEvent } from "../services/googleCalendar";
import { IMeeting } from "./models";
import { prisma } from "../lib/prisma";

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
): Promise<Record<string, string>> {
  if (!accessToken) return {};
  const calendarIds = calendarIdsForMeeting(meeting.calType ?? []);
  const resumeEventIds: Record<string, string> = {};

  if (meeting.isRecurring && meeting.recurrencePattern) {
    const resumeDateStr = firstOccurrenceOnOrAfter(
      { ...meeting.recurrencePattern, daysOfWeek: meeting.recurrencePattern.daysOfWeek ?? [] },
      formatETDateString(resumeDate),
    );
    if (!resumeDateStr) return {};
    const { start, end } = adjustOccurrenceToDate(meeting, resumeDateStr);
    const resumeMeeting = toCalendarMeeting(meeting, start, end);
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const { id } = await createCalendarEvent(accessToken, resumeMeeting, calId);
      if (id) resumeEventIds[cat] = id;
    }
  } else if (meeting.startDateTime > new Date()) {
    // One-time meeting: only worth pre-creating if the original occurrence hasn't happened yet
    // -- otherwise there's nothing meaningful to resume it into.
    const resumeMeeting = toCalendarMeeting(meeting, meeting.startDateTime, meeting.endDateTime);
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const { id } = await createCalendarEvent(accessToken, resumeMeeting, calId);
      if (id) resumeEventIds[cat] = id;
    }
  }

  return resumeEventIds;
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

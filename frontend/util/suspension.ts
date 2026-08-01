import "server-only";
import { Meeting, RecurrencePattern, SuspensionPeriod } from "@prisma/client";
import { formatETDateString } from "./timeUtils";
import { isDateSuspended } from "./meetingOccurrences";
import { prisma } from "../lib/prisma";

type MeetingWithSuspensions = Meeting & {
  recurrencePattern: RecurrencePattern | null;
  suspensions: SuspensionPeriod[];
};

// The suspension row covering today, if any -- "currently suspended" is always this, never a
// stored flag. `null` if the meeting isn't suspended today (whether it never was, or a past
// suspension's `to` date has already passed).
export const getOpenSuspension = (meeting: MeetingWithSuspensions, todayStr = formatETDateString(new Date())): SuspensionPeriod | null =>
  meeting.suspensions.find((s) => isDateSuspended([s], todayStr)) ?? null;

// Lazy self-heal: if the meeting's most recent suspension pre-created a post-resume GCal series
// (resumeEventIds) and that series' start date has actually arrived, but nothing has promoted it
// into Meeting.googleCalendarEventIds yet, do that now. Cron-free by design -- this only needs to
// run the next time anything touches the meeting (update/delete/suspend/resume routes all call it
// right after fetching), and GCal's own recurrence engine already shows the pre-created series to
// the public regardless of whether our DB pointer has caught up.
export const reconcilePendingResume = async (meeting: MeetingWithSuspensions): Promise<Record<string, string>> => {
  const eventIds = (meeting.googleCalendarEventIds ?? {}) as Record<string, string>;
  const todayStr = formatETDateString(new Date());

  const pending = meeting.suspensions.find(
    (s) => !s.promoted && s.resumeEventIds && s.to && formatETDateString(new Date(s.to)) <= todayStr,
  );
  if (!pending) return eventIds;

  const resumeEventIds = pending.resumeEventIds as Record<string, string>;
  await prisma.$transaction([
    prisma.meeting.update({ where: { mid: meeting.mid }, data: { googleCalendarEventIds: resumeEventIds } }),
    prisma.suspensionPeriod.update({ where: { id: pending.id }, data: { promoted: true } }),
  ]);
  return resumeEventIds;
};

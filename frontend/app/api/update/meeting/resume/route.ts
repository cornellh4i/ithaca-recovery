import { Role, SuspensionPeriod } from '@prisma/client';
import { NextResponse, after } from 'next/server';
import { requireRole } from '../../../../../services/auth';
import { deleteCalendarEvent, createCalendarEvent, calendarIdsForMeeting } from '../../../../../services/googleCalendar';
import { formatETDateString } from '../../../../../util/timeUtils';
import {
  getUnresolvedSuspension,
  reconcilePendingResume,
  toCalendarMeeting,
  createPendingResumeSeries,
  tearDownPendingResumeSeries,
  MeetingWithPattern,
  MeetingWithSuspensions,
} from '../../../../../util/suspension';
import { prisma } from '../../../../../lib/prisma';

// Resuming always creates a fresh series/event starting today (or recreates the original
// one-time event) and writes the result directly to Meeting.googleCalendarEventIds -- an early
// manual resume (before a scheduled `to` date) was never going to want the pre-created future
// series' start date, so any pending resumeEventIds on this suspension are discarded, not reused.
async function syncResume(
  meeting: MeetingWithPattern,
  openSuspension: SuspensionPeriod,
  accessToken: string | undefined,
): Promise<void> {
  if (!accessToken) return;
  const calendarIds = calendarIdsForMeeting(meeting.calType ?? []);

  if (openSuspension.resumeEventIds) {
    const pending = openSuspension.resumeEventIds as Record<string, string>;
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const eventId = pending[cat];
      if (eventId) await deleteCalendarEvent(accessToken, eventId, calId);
    }
  }

  const meetingForSync = toCalendarMeeting(meeting, meeting.startDateTime, meeting.endDateTime);
  const eventIds: Record<string, string> = {};
  for (const [cat, calId] of Object.entries(calendarIds)) {
    const { id } = await createCalendarEvent(accessToken, meetingForSync, calId);
    if (id) eventIds[cat] = id;
  }

  await prisma.meeting.update({ where: { mid: meeting.mid }, data: { googleCalendarEventIds: eventIds } });
}

// "Resume on X" doesn't reactivate anything now -- it just moves the open suspension's scheduled
// resume date, same mechanism as suspend's own "Until X" option (reconcilePendingResume auto-
// promotes it once X arrives). Any previously-scheduled pending series is torn down first so
// picking a new date never leaves the old one orphaned on Google Calendar.
async function syncRescheduleResume(
  meeting: MeetingWithSuspensions,
  suspensionId: string,
  accessToken: string | undefined,
  onDate: Date,
): Promise<void> {
  if (!accessToken) return;
  await tearDownPendingResumeSeries(meeting, accessToken);
  const resumeEventIds = await createPendingResumeSeries(meeting, accessToken, onDate);
  await prisma.suspensionPeriod.update({
    where: { id: suspensionId },
    data: { resumeEventIds: Object.keys(resumeEventIds).length > 0 ? resumeEventIds : null, promoted: false },
  });
}

const resumeMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const { mid, on } = await request.json();
    if (!mid) {
      return NextResponse.json({ error: "mid is required" }, { status: 400 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { mid },
      include: { recurrencePattern: true, suspensions: true },
    });
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    await reconcilePendingResume(meeting);

    const todayStr = formatETDateString(new Date());
    // Includes a suspension scheduled to start later, not just one already active today -- an
    // admin needs to be able to cancel a not-yet-started suspension the same way they'd resume
    // an active one, rather than being stuck with no valid action until it actually kicks in.
    const openSuspension = getUnresolvedSuspension(meeting, todayStr);
    if (!openSuspension) {
      return NextResponse.json({ error: "Meeting has no suspension to resume" }, { status: 400 });
    }

    if (on != null) {
      const onDate = new Date(on);
      if (Number.isNaN(onDate.getTime())) {
        return NextResponse.json({ error: "on must be a valid date" }, { status: 400 });
      }
      // Must be after whichever is later: today, or the suspension's own start date. A pending
      // suspension can have `from` in the future -- validating against today alone would let
      // `on` land before `from`, producing an inverted (to < from) range that isDateSuspended
      // can never match, silently turning the suspension into a permanent no-op.
      const fromStr = formatETDateString(openSuspension.from);
      const minStr = fromStr > todayStr ? fromStr : todayStr;
      if (formatETDateString(onDate) <= minStr) {
        return NextResponse.json({ error: "on must be after the suspension's start date" }, { status: 400 });
      }

      // Same single-winner guard as the immediate-resume path below: only an unpromoted row can
      // still be rescheduled, so a request racing reconcilePendingResume's own promotion (or a
      // second concurrent reschedule) that loses the race must not also kick off syncReschedule
      // Resume for a suspension that's no longer open.
      const rescheduled = await prisma.suspensionPeriod.updateMany({
        where: { id: openSuspension.id, promoted: false },
        data: { to: onDate },
      });
      if (rescheduled.count === 0) {
        return NextResponse.json({ error: "Meeting was already resumed" }, { status: 409 });
      }
      after(syncRescheduleResume(meeting, openSuspension.id, auth.accessToken, onDate));

      return NextResponse.json({ message: "Resume scheduled" });
    }

    // Gated on `promoted: false` -- the only writers that ever set it true are this close and
    // reconcilePendingResume's own promotion, so it doubles as a single-winner check: if two
    // resume requests race on the same open suspension, only the first `updateMany` actually
    // matches a row (count 1); the loser sees count 0 and must not also schedule a duplicate
    // syncResume, which would otherwise create a second calendar event for the same meeting.
    const won = await prisma.$transaction(async (tx) => {
      const closed = await tx.suspensionPeriod.updateMany({
        where: { id: openSuspension.id, promoted: false },
        // resumeEventIds are deleted by syncResume below, so clear them here too -- otherwise
        // reconcilePendingResume sees an unpromoted, now-due row and republishes dead IDs.
        data: { to: new Date(), resumeEventIds: null, promoted: true },
      });
      if (closed.count === 0) return false;
      await tx.meeting.update({ where: { mid }, data: { status: 'Active' } });
      return true;
    });

    if (!won) {
      return NextResponse.json({ error: "Meeting was already resumed" }, { status: 409 });
    }

    after(syncResume(meeting, openSuspension, auth.accessToken));

    return NextResponse.json({ message: "Meeting resumed" });
  } catch (error) {
    console.error("Error resuming meeting: ", error);
    return NextResponse.json({ error: "Failed to resume meeting" }, { status: 500 });
  }
};

export { resumeMeeting as POST };

import { Meeting, RecurrencePattern, Role, SuspensionPeriod } from '@prisma/client';
import { NextResponse, after } from 'next/server';
import { requireRole } from '../../../../../services/auth';
import { deleteCalendarEvent, createCalendarEvent, calendarIdsForMeeting } from '../../../../../services/googleCalendar';
import { formatETDateString } from '../../../../../util/timeUtils';
import { getOpenSuspension, reconcilePendingResume } from '../../../../../util/suspension';
import { IMeeting } from '../../../../../util/models';
import { prisma } from '../../../../../lib/prisma';

type MeetingWithPattern = Meeting & { recurrencePattern: RecurrencePattern | null };

function toCalendarMeeting(meeting: MeetingWithPattern): IMeeting {
  return {
    mid: meeting.mid,
    title: meeting.title,
    description: meeting.description,
    creator: meeting.creator,
    group: meeting.group,
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    email: meeting.email,
    zoomRoom: meeting.zoomRoom,
    zoomLink: meeting.zoomLink,
    calType: meeting.calType,
    modeType: meeting.modeType,
    room: meeting.room,
    isRecurring: meeting.isRecurring,
    recurrencePattern: meeting.recurrencePattern,
  };
}

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

  const meetingForSync = toCalendarMeeting(meeting);
  const eventIds: Record<string, string> = {};
  for (const [cat, calId] of Object.entries(calendarIds)) {
    const id = await createCalendarEvent(accessToken, meetingForSync, calId);
    if (id) eventIds[cat] = id;
  }

  await prisma.meeting.update({ where: { mid: meeting.mid }, data: { googleCalendarEventIds: eventIds } });
}

const resumeMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const { mid } = await request.json();
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
    const openSuspension = getOpenSuspension(meeting, todayStr);
    if (!openSuspension) {
      return NextResponse.json({ error: "Meeting is not currently suspended" }, { status: 400 });
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

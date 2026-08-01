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

    await prisma.meeting.update({ where: { mid }, data: { status: 'Active' } });
    await prisma.suspensionPeriod.update({ where: { id: openSuspension.id }, data: { to: new Date() } });

    after(syncResume(meeting, openSuspension, auth.accessToken));

    return NextResponse.json({ message: "Meeting resumed" });
  } catch (error) {
    console.error("Error resuming meeting: ", error);
    return NextResponse.json({ error: "Failed to resume meeting" }, { status: 500 });
  }
};

export { resumeMeeting as POST };

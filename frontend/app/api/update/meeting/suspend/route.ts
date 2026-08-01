import { Meeting, RecurrencePattern, Role } from '@prisma/client';
import { NextResponse, after } from 'next/server';
import { requireRole } from '../../../../../services/auth';
import {
  trimCalendarEventSeries,
  deleteCalendarEvent,
  createCalendarEvent,
  calendarIdsForMeeting,
} from '../../../../../services/googleCalendar';
import { formatETDateString } from '../../../../../util/timeUtils';
import { addOneETDay, adjustOccurrenceToDate, firstOccurrenceOnOrAfter } from '../../../../../util/meetingOccurrences';
import { getOpenSuspension, reconcilePendingResume } from '../../../../../util/suspension';
import { IMeeting } from '../../../../../util/models';
import { prisma } from '../../../../../lib/prisma';

type MeetingWithPattern = Meeting & { recurrencePattern: RecurrencePattern | null };

// Only the fields services/googleCalendar.ts's buildEventBody actually reads -- constructed
// explicitly rather than spreading the Prisma row, since Prisma's Meeting type doesn't line up
// field-for-field with IMeeting (e.g. googleCalendarEventIds is a JsonValue here, not a typed
// Record).
function toCalendarMeeting(
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

async function syncSuspend(
  meeting: MeetingWithPattern,
  suspensionId: string,
  accessToken: string | undefined,
  to: Date | null,
  reconciledEventIds: Record<string, string>,
): Promise<void> {
  if (!accessToken) return;
  const calendarIds = calendarIdsForMeeting(meeting.calType ?? []);

  if (meeting.isRecurring && meeting.recurrencePattern) {
    // Truncate starting tomorrow, not today -- a suspension taking effect this instant
    // shouldn't retroactively remove today's already-scheduled occurrence.
    const tomorrowStr = addOneETDay(formatETDateString(new Date()));
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const eventId = reconciledEventIds[cat];
      if (eventId) await trimCalendarEventSeries(accessToken, eventId, tomorrowStr, calId);
    }

    if (to) {
      const resumeDateStr = firstOccurrenceOnOrAfter(
        { ...meeting.recurrencePattern, daysOfWeek: meeting.recurrencePattern.daysOfWeek ?? [] },
        formatETDateString(to),
      );
      if (resumeDateStr) {
        const { start, end } = adjustOccurrenceToDate(meeting, resumeDateStr);
        const resumeMeeting = toCalendarMeeting(meeting, start, end);
        const resumeEventIds: Record<string, string> = {};
        for (const [cat, calId] of Object.entries(calendarIds)) {
          const id = await createCalendarEvent(accessToken, resumeMeeting, calId);
          if (id) resumeEventIds[cat] = id;
        }
        await prisma.suspensionPeriod.update({ where: { id: suspensionId }, data: { resumeEventIds } });
      }
    }
  } else {
    // One-time meeting: nothing recurring to truncate, just remove the single event.
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const eventId = reconciledEventIds[cat];
      if (eventId) await deleteCalendarEvent(accessToken, eventId, calId);
    }

    // If a resume date was given and the meeting's original occurrence hasn't happened yet,
    // pre-create it at that same original time so reconcilePendingResume can auto-restore it
    // once `to` arrives -- otherwise a scheduled (not manually-triggered) resume would leave a
    // one-time meeting permanently missing from Google Calendar. An early manual resume (via
    // the resume route) still recreates it fresh regardless of this.
    if (to && meeting.startDateTime > new Date()) {
      const resumeMeeting = toCalendarMeeting(meeting, meeting.startDateTime, meeting.endDateTime);
      const resumeEventIds: Record<string, string> = {};
      for (const [cat, calId] of Object.entries(calendarIds)) {
        const id = await createCalendarEvent(accessToken, resumeMeeting, calId);
        if (id) resumeEventIds[cat] = id;
      }
      await prisma.suspensionPeriod.update({ where: { id: suspensionId }, data: { resumeEventIds } });
    }
  }
}

const suspendMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const { mid, to } = await request.json();
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

    const reconciledEventIds = await reconcilePendingResume(meeting);

    if (getOpenSuspension(meeting)) {
      return NextResponse.json({ error: "Meeting is already suspended" }, { status: 400 });
    }

    const from = new Date();
    let toDate: Date | null = null;
    if (to != null) {
      toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "to must be a valid date" }, { status: 400 });
      }
      if (formatETDateString(toDate) <= formatETDateString(from)) {
        return NextResponse.json({ error: "to must be after today" }, { status: 400 });
      }
    }

    const [, suspension] = await prisma.$transaction([
      prisma.meeting.update({ where: { mid }, data: { status: 'Suspended' } }),
      prisma.suspensionPeriod.create({ data: { mid, from, to: toDate } }),
    ]);

    after(syncSuspend(meeting, suspension.id, auth.accessToken, toDate, reconciledEventIds));

    return NextResponse.json({ message: "Meeting suspended", suspensionId: suspension.id });
  } catch (error) {
    console.error("Error suspending meeting: ", error);
    return NextResponse.json({ error: "Failed to suspend meeting" }, { status: 500 });
  }
};

export { suspendMeeting as POST };

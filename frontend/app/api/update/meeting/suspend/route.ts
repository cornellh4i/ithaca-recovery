import { Prisma, Role } from '@prisma/client';
import { NextResponse, after } from 'next/server';
import { requireRole } from '../../../../../services/auth';
import { trimCalendarEventSeries, deleteCalendarEvent, calendarIdsForMeeting } from '../../../../../services/googleCalendar';
import { formatETDateString, getETDayBounds } from '../../../../../util/timeUtils';
import { addOneETDay } from '../../../../../util/meetingOccurrences';
import { getUnresolvedSuspension, reconcilePendingResume, createPendingResumeSeries, MeetingWithPattern } from '../../../../../util/suspension';
import { prisma } from '../../../../../lib/prisma';

// MongoDB doesn't support SQL-style isolation levels (no Prisma isolationLevel option), and
// Prisma never auto-retries a P2034 write conflict -- that's on the caller. Both racing
// suspend transactions below write to the same Meeting document (the status update), so if two
// land close enough together Mongo's own transaction engine detects the conflict on whichever
// commits second and Prisma surfaces it as P2034; retrying re-runs the whole callback, which
// re-reads suspensions fresh and correctly sees the first request's now-committed row.
async function withWriteConflictRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isWriteConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (!isWriteConflict || attempt === attempts) throw err;
    }
  }
  throw new Error('unreachable');
}

async function syncSuspend(
  meeting: MeetingWithPattern,
  suspensionId: string,
  accessToken: string | undefined,
  from: Date,
  to: Date | null,
  reconciledEventIds: Record<string, string>,
): Promise<void> {
  if (!accessToken) return;
  const calendarIds = calendarIdsForMeeting(meeting.calType ?? []);

  if (meeting.isRecurring && meeting.recurrencePattern) {
    // Truncate starting at `from`, but never earlier than tomorrow -- Google Calendar can't
    // retroactively un-publish an occurrence that's already live today, even when `from` itself
    // is today (a suspension taking effect this instant shouldn't retroactively remove today's
    // already-scheduled occurrence). For a genuinely future `from` (the admin suspended a
    // not-yet-arrived occurrence), this correctly leaves everything before it untouched.
    const tomorrowStr = addOneETDay(formatETDateString(new Date()));
    const fromStr = formatETDateString(from);
    const truncateFromStr = fromStr > tomorrowStr ? fromStr : tomorrowStr;
    // ET-anchored, not the bare date string -- trimCalendarEventSeries re-parses its
    // occurrenceISODate with `new Date(...)` and reformats to an ET calendar day. A date-only
    // string like "2026-08-05" parses as UTC midnight, which is still the *previous* ET day
    // (UTC-4/-5), silently trimming one day too early.
    const [truncateFromInstant] = getETDayBounds(truncateFromStr);
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const eventId = reconciledEventIds[cat];
      if (eventId) await trimCalendarEventSeries(accessToken, eventId, truncateFromInstant.toISOString(), calId);
    }
  } else {
    // One-time meeting: nothing recurring to truncate, just remove the single event.
    for (const [cat, calId] of Object.entries(calendarIds)) {
      const eventId = reconciledEventIds[cat];
      if (eventId) await deleteCalendarEvent(accessToken, eventId, calId);
    }
  }

  if (to) {
    const { resumeEventIds } = await createPendingResumeSeries(meeting, accessToken, to);
    if (Object.keys(resumeEventIds).length > 0) {
      await prisma.suspensionPeriod.update({ where: { id: suspensionId }, data: { resumeEventIds } });
    }
  }
}

const suspendMeeting = async (request: Request) => {
  try {
    const auth = await requireRole(Role.ADMIN);
    if (auth instanceof Response) return auth;

    const { mid, to, from: fromInput } = await request.json();
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

    // `from` is the clicked occurrence's date, clamped to never be earlier than today -- a
    // suspension can't retroactively un-happen a past occurrence, so clicking one just means
    // "starting today," but clicking a genuinely future occurrence schedules the suspension to
    // actually start then instead of hiding everything from today onward. `fromInput` is
    // frontend-computed, not directly user-typed, so an invalid/missing value just falls back
    // to real now rather than 400ing.
    const todayStr = formatETDateString(new Date());
    let from = new Date();
    if (fromInput != null) {
      const requestedFrom = new Date(fromInput);
      if (!Number.isNaN(requestedFrom.getTime()) && formatETDateString(requestedFrom) > todayStr) {
        from = requestedFrom;
      }
    }

    let toDate: Date | null = null;
    if (to != null) {
      toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "to must be a valid date" }, { status: 400 });
      }
      if (formatETDateString(toDate) <= formatETDateString(from)) {
        return NextResponse.json({ error: "to must be after the suspension start date" }, { status: 400 });
      }
    }

    // Re-checks getUnresolvedSuspension *inside* the transaction (not the `meeting` fetched
    // above, which could already be stale) so two requests racing to suspend the same meeting
    // can't both pass the check -- see withWriteConflictRetry above for how the second one gets
    // a correct answer instead of a raw transaction failure.
    const result = await withWriteConflictRetry(() =>
      prisma.$transaction(async (tx) => {
        const current = await tx.meeting.findUnique({ where: { mid }, select: { suspensions: true } });
        if (!current) return { conflict: false as const, notFound: true as const };
        if (getUnresolvedSuspension(current)) return { conflict: true as const, notFound: false as const };

        await tx.meeting.update({ where: { mid }, data: { status: 'Suspended' } });
        const suspension = await tx.suspensionPeriod.create({ data: { mid, from, to: toDate } });
        return { conflict: false as const, notFound: false as const, suspension };
      }),
    );

    if (result.notFound) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    if (result.conflict) {
      return NextResponse.json(
        { error: "This meeting already has an active or scheduled suspension — only one is allowed at a time." },
        { status: 409 },
      );
    }

    after(syncSuspend(meeting, result.suspension.id, auth.accessToken, from, toDate, reconciledEventIds));

    return NextResponse.json({ message: "Meeting suspended", suspensionId: result.suspension.id });
  } catch (error) {
    console.error("Error suspending meeting: ", error);
    return NextResponse.json({ error: "Failed to suspend meeting" }, { status: 500 });
  }
};

export { suspendMeeting as POST };

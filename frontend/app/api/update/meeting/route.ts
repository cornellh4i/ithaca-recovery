import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/authConfig";
import { IMeeting } from "../../../../util/models";
import { reconcileMeetingCalendars } from "../../../../services/googleCalendar";

const prisma = new PrismaClient();

const updateMeeting = async (request: Request): Promise<Response> => {
  try {
    const newMeeting = await request.json() as IMeeting;

    const existingMeeting = await prisma.meeting.findUnique({
      where: {
        mid: newMeeting.mid,
      },
      include: { recurrencePattern: true },
    });

    if (!existingMeeting) {
      console.error('Meeting not found:', newMeeting.mid);
      return NextResponse.json({ error: `Meeting with ID ${newMeeting.mid} not found` }, { status: 404 });
    }

    const { mid, recurrencePattern, ...meetingFields } = newMeeting;

    const updatedMeeting = await prisma.meeting.update({
      where: {
        mid: mid,
      },
      data: {
        ...meetingFields,
        recurrencePattern: recurrencePattern
          ? {
              upsert: {
                update: {
                  type: recurrencePattern.type,
                  startDate: recurrencePattern.startDate,
                  endDate: recurrencePattern.endDate ?? undefined,
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
                  endDate: recurrencePattern.endDate ?? undefined,
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
    

    // Google Calendar sync — failure updates syncStatus but does not fail the request
    const session = await getServerSession(authOptions);
    if (session?.accessToken && newMeeting.status !== 'Suspended') {
      const existingEventIds = (existingMeeting.googleCalendarEventIds ?? {}) as Record<string, string>;
      const { updatedEventIds, allSynced } = await reconcileMeetingCalendars(
        session.accessToken,
        newMeeting,
        existingEventIds,
      );

      await prisma.meeting.update({
        where: { mid },
        data: {
          googleCalendarEventIds: updatedEventIds,
          syncStatus: allSynced ? 'synced' : 'error',
        },
      });
    }

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error occurred",
      details: error
    }, { status: 500 });
  }
};

export { updateMeeting as PUT };
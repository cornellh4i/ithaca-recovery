import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/authConfig";
import { IMeeting } from "../../../../util/models";
import { createCalendarEvent, updateCalendarEvent } from "../../../../services/googleCalendar";

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
                },
                create: {
                  type: recurrencePattern.type,
                  startDate: recurrencePattern.startDate,
                  endDate: recurrencePattern.endDate ?? undefined,
                  numberOfOccurrences: recurrencePattern.numberOfOccurrences ?? undefined,
                  daysOfWeek: recurrencePattern.daysOfWeek ?? [],
                  firstDayOfWeek: recurrencePattern.firstDayOfWeek,
                  interval: recurrencePattern.interval,
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
    if (session?.accessToken) {
      const existingEventId = existingMeeting.googleCalendarEventId;
      let synced: boolean;
      let newEventId: string | null = null;

      if (existingEventId) {
        synced = await updateCalendarEvent(session.accessToken, existingEventId, newMeeting);
      } else {
        newEventId = await createCalendarEvent(session.accessToken, newMeeting);
        synced = !!newEventId;
      }

      await prisma.meeting.update({
        where: { mid },
        data: {
          ...(newEventId ? { googleCalendarEventId: newEventId } : {}),
          syncStatus: synced ? 'synced' : 'error',
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
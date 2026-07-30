import { randomUUID } from "crypto";
import { Meeting, RecurrencePattern } from "@prisma/client";
import { getTestPrismaClient } from "./db";
import { convertETToUTC, formatETDateString } from "../../util/timeUtils";

export async function seedMeeting(overrides: Partial<Meeting> = {}): Promise<Meeting> {
  const prisma = getTestPrismaClient();
  // Today's date in ET — used as the default day for seeded meetings so they
  // reliably show up in Day/Week view without hardcoded dates going stale.
  const etDate = formatETDateString(new Date());
  return prisma.meeting.create({
    data: {
      mid: `m-${randomUUID()}`,
      title: "Test Meeting",
      calType: ["AA"],
      description: "Seeded by test factory",
      creator: "Test Suite",
      group: "Test Group",
      startDateTime: new Date(convertETToUTC(`${etDate}T18:00:00`)),
      endDateTime: new Date(convertETToUTC(`${etDate}T19:00:00`)),
      email: "seed@test.icr",
      room: "Serenity Room",
      modeType: "In Person",
      status: "Active",
      isRecurring: false,
      ...overrides,
    },
  });
}

export async function seedRecurringMeeting(
  overrides: Partial<Meeting> = {},
  recurrenceOverrides: Partial<RecurrencePattern> = {},
): Promise<{ meeting: Meeting; recurrencePattern: RecurrencePattern }> {
  const prisma = getTestPrismaClient();
  const meeting = await seedMeeting({ isRecurring: true, ...overrides });
  const recurrencePattern = await prisma.recurrencePattern.create({
    data: {
      mid: meeting.mid,
      type: "weekly",
      startDate: meeting.startDateTime,
      daysOfWeek: [],
      firstDayOfWeek: "Sunday",
      interval: 1,
      excludedDates: [],
      ...recurrenceOverrides,
    },
  });
  return { meeting, recurrencePattern };
}

export async function seedSuspendedMeeting(overrides: Partial<Meeting> = {}): Promise<Meeting> {
  // No UI path sets this today (confirmed gap) — only reachable via direct seed.
  return seedMeeting({ status: "Suspended", ...overrides });
}

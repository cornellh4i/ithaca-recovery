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

// Plain-data counterpart to seedMeeting, for route tests that build the data
// themselves (e.g. to create several meetings before hitting a GET route) rather
// than inserting one at a time. Anchored to today (ET) rather than a fixed date
// literal so fixtures don't silently drift outside a rolling conflict-detection
// window months/years after being written.
export function buildMeetingData(overrides: Partial<Meeting> = {}) {
  const etDate = formatETDateString(new Date());
  return {
    mid: `m-${randomUUID()}`,
    title: "Test Meeting",
    modeType: "In Person",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: new Date(convertETToUTC(`${etDate}T18:00:00`)),
    endDateTime: new Date(convertETToUTC(`${etDate}T19:00:00`)),
    email: "route-test@test.icr",
    zoomRoom: null as string | null,
    calType: ["AA"],
    status: "Active",
    room: "Serenity Room",
    isRecurring: false,
    ...overrides,
  };
}

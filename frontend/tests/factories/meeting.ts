import { randomUUID } from "crypto";
import { Meeting, Prisma, RecurrencePattern, SuspensionPeriod } from "@prisma/client";
import { getTestPrismaClient } from "./db";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";

// Overrides are typed against Prisma's *create* input, not the `Meeting`/`SuspensionPeriod`
// model (query-result) types -- those disagree on nullable Json fields (the model type allows
// plain `null`, Prisma's create input requires `Prisma.JsonNull` instead), which otherwise
// makes every override object here fail to typecheck against `.create()`'s `data`.
export async function seedMeeting(overrides: Partial<Prisma.MeetingCreateInput> = {}): Promise<Meeting> {
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
  overrides: Partial<Prisma.MeetingCreateInput> = {},
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

export async function seedSuspensionPeriod(
  mid: string,
  // Unchecked variant, not the (default) relation-based one -- `mid` below is the scalar FK,
  // and mixing it with the relation-based input's optional `meeting` field breaks Prisma's
  // checked/unchecked discriminated union.
  overrides: Partial<Prisma.SuspensionPeriodUncheckedCreateInput> = {},
): Promise<SuspensionPeriod> {
  const prisma = getTestPrismaClient();
  return prisma.suspensionPeriod.create({
    data: {
      mid,
      from: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday, so "today" is covered
      to: null,
      ...overrides,
    },
  });
}

export async function seedSuspendedMeeting(overrides: Partial<Prisma.MeetingCreateInput> = {}): Promise<Meeting> {
  const meeting = await seedMeeting({ status: "Suspended", ...overrides });
  await seedSuspensionPeriod(meeting.mid);
  return meeting;
}

// Plain-data counterpart to seedMeeting, for route tests that build the data
// themselves (e.g. to create several meetings before hitting a GET route) rather
// than inserting one at a time. Anchored to today (ET) rather than a fixed date
// literal so fixtures don't silently drift outside a rolling conflict-detection
// window months/years after being written.
export function buildMeetingData(overrides: Partial<Prisma.MeetingCreateInput> = {}) {
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

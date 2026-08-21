jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { email: "admin@icr.test", role: "SUPER_ADMIN" },
    accessToken: "fake-token",
  }),
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { seedLeaseSettings } from "../factories/leaseSettings";
import { GET } from "../../app/api/export/lease/route";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

// Cleanup runs even after a failed assertion, not just at the end of a passing test body --
// LeaseSettings.id is now a fixed singleton PK (see schema.prisma), so a row left behind by a
// failed test would otherwise make the next test's seedLeaseSettings() throw a P2002 unique
// violation instead of that test's own real assertion failure.
let seededGroups: string[] = [];

afterEach(async () => {
  const prisma = getTestPrismaClient();
  if (seededGroups.length > 0) {
    // RecurrencePattern.mid -> Meeting.mid is ON DELETE RESTRICT (see schema.prisma) -- this
    // file now seeds recurring meetings too, so their pattern rows must go first or
    // meeting.deleteMany below throws a foreign key violation instead of just cleaning up.
    await prisma.recurrencePattern.deleteMany({ where: { meeting: { group: { in: seededGroups } } } });
    await prisma.meeting.deleteMany({ where: { group: { in: seededGroups } } });
    seededGroups = [];
  }
  await prisma.leaseSettings.deleteMany();
});

// Parses a named CSV column for a row identified by its "Group Name" -- avoids pulling in a
// full CSV parser for a handful of fields with no embedded commas.
function columnValueFor(csv: string, groupName: string, column: string): string {
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const groupNameIndex = header.indexOf("Group Name");
  const columnIndex = header.indexOf(column);
  const row = lines.slice(1).find((line) => line.split(",")[groupNameIndex] === groupName);
  if (!row) throw new Error(`No CSV row found for group "${groupName}"`);
  return row.split(",")[columnIndex];
}

function rentChargeFor(csv: string, groupName: string): string {
  return columnValueFor(csv, groupName, "Rent Charge");
}

function rowCountFor(csv: string, groupName: string): number {
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const groupNameIndex = header.indexOf("Group Name");
  return lines.slice(1).filter((line) => line.split(",")[groupNameIndex] === groupName).length;
}

test("calculateRentCharge: non-monthly room uses a flat 4 weeks/month, monthly room and Zoom Only return the flat rate", async () => {
  await seedLeaseSettings({
    rooms: [
      { room: "Serenity Room", rate: 15, unit: "hr" },
      { room: "Monthly Room", rate: 500, unit: "month" },
      { room: "Zoom Only", rate: 25, unit: "hr" },
    ],
  });

  // Non-monthly: 1 billable hour * $15/hr * 4 = $60.00 exactly.
  await seedMeeting({
    title: "Hourly Group",
    group: "Hourly Group",
    room: "Serenity Room",
    modeType: "In Person",
  });

  // Monthly: flat $500 regardless of the meeting's actual duration.
  await seedMeeting({
    title: "Monthly Group",
    group: "Monthly Group",
    room: "Monthly Room",
    modeType: "In Person",
  });

  // Zoom Only: flat $25 regardless of duration -- Remote meetings store room as "".
  await seedMeeting({
    title: "Remote Group",
    group: "Remote Group",
    room: "",
    modeType: "Remote",
  });
  seededGroups.push("Hourly Group", "Monthly Group", "Remote Group");

  const response = await GET();
  expect(response.status).toBe(200);
  const csv = await response.text();

  expect(rentChargeFor(csv, "Hourly Group")).toBe("$60.00");
  expect(rentChargeFor(csv, "Monthly Group")).toBe("$500.00");
  expect(rentChargeFor(csv, "Remote Group")).toBe("$25.00");
});

// formatTime() reads Meeting.startDateTime/endDateTime (real UTC instants) in ET, not UTC --
// seedMeeting's default 6:00-7:00 PM ET start/end exercises this directly, since reading the
// UTC hour instead would show a different time (4-5 hours off, DST-dependent).
test("formatTime: Start/End Time columns show the meeting's ET wall-clock time, not its UTC hour", async () => {
  await seedLeaseSettings({ rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }] });
  await seedMeeting({
    title: "Time Group",
    group: "Time Group",
    room: "Serenity Room",
    modeType: "In Person",
  });
  seededGroups.push("Time Group");

  const response = await GET();
  expect(response.status).toBe(200);
  const csv = await response.text();

  expect(columnValueFor(csv, "Time Group", "Start Time")).toBe("6:00 PM");
  expect(columnValueFor(csv, "Time Group", "End Time")).toBe("7:00 PM");
});

// Excluding one occurrence (delete "this") doesn't touch Meeting.startDateTime/endDateTime, so
// billable time and Rent Charge are computed exactly as if no date were excluded -- flagged in
// the #498 audit as a documented, not-fixed-here billing gap (export-data.md's "meeting's own
// hours" note already covers why the flat 4x multiplier can't reflect per-occurrence removals).
test("excluded occurrence: series with one excludedDates entry still bills the full flat rate, single row", async () => {
  await seedLeaseSettings({ rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }] });
  await seedRecurringMeeting(
    { title: "Excluded Group", group: "Excluded Group", room: "Serenity Room", modeType: "In Person" },
    { daysOfWeek: ["Monday"], excludedDates: [new Date()] },
  );
  seededGroups.push("Excluded Group");

  const response = await GET();
  const csv = await response.text();

  expect(rowCountFor(csv, "Excluded Group")).toBe(1);
  expect(rentChargeFor(csv, "Excluded Group")).toBe("$60.00");
});

// A "this and following" delete trims RecurrencePattern.endDate but leaves the Meeting row
// itself in place (see app/api/delete/meeting/route.ts) -- still exactly one export row, same
// as the untrimmed case above.
test("trimmed series: thisAndFollowing-deleted series (endDate set) still emits exactly one row", async () => {
  await seedLeaseSettings({ rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }] });
  const { meeting } = await seedRecurringMeeting({
    title: "Trimmed Group",
    group: "Trimmed Group",
    room: "Serenity Room",
    modeType: "In Person",
  });
  await getTestPrismaClient().recurrencePattern.update({
    where: { mid: meeting.mid },
    data: { endDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });
  seededGroups.push("Trimmed Group");

  const response = await GET();
  const csv = await response.text();

  expect(rowCountFor(csv, "Trimmed Group")).toBe(1);
});

// #497 "this and following" edit: the original row is trimmed (endDate set) and a new tail row
// takes over with its own later startDateTime, carrying splitFromMid back to the root. Billing
// must collapse both rows into one -- the tail is the representative since its schedule starts
// latest.
test("split pair (thisAndFollowing tail): lineage bills as one row, using the tail's schedule", async () => {
  await seedLeaseSettings({ rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }, { room: "Chapel", rate: 20, unit: "hr" }] });
  const { meeting: root } = await seedRecurringMeeting({
    title: "Split Group",
    group: "Split Group",
    room: "Serenity Room",
    modeType: "In Person",
    startDateTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  });
  await getTestPrismaClient().recurrencePattern.update({
    where: { mid: root.mid },
    data: { endDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
  });
  await seedRecurringMeeting({
    title: "Split Group",
    group: "Split Group",
    room: "Chapel",
    modeType: "In Person",
    startDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
    splitFromMid: root.mid,
  });
  seededGroups.push("Split Group");

  const response = await GET();
  const csv = await response.text();

  expect(rowCountFor(csv, "Split Group")).toBe(1);
  // Tail's room ($20/hr, 2 billable hours) is the one that should win, not the root's ($15/hr, 1hr).
  expect(rentChargeFor(csv, "Split Group")).toBe("$160.00");
  expect(columnValueFor(csv, "Split Group", "Room")).toBe("Chapel ($20/hr)");
});

// #497 "this" edit: a single occurrence detaches into its own one-time Meeting row (no
// recurrencePattern) with splitFromMid pointing at the root. Its startDateTime (the clicked
// occurrence date) is always later than the still-recurring root's anchor, but it must NOT win
// the representative pick -- the root is still the group's ongoing obligation, and one edited
// occurrence shouldn't stand in for the whole series' room/day/duration on the bill.
test("split pair (this detached occurrence): lineage bills as one row, using the still-recurring parent", async () => {
  await seedLeaseSettings({ rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }, { room: "Chapel", rate: 20, unit: "hr" }] });
  const { meeting: root } = await seedRecurringMeeting(
    {
      title: "Detached Group",
      group: "Detached Group",
      room: "Serenity Room",
      modeType: "In Person",
      startDateTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDateTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    },
    { daysOfWeek: ["Monday"] },
  );
  // Room/duration deliberately differ from the root -- if the detached row wins the
  // representative pick, these values (and "One-time") would leak into the CSV row instead.
  await seedMeeting({
    title: "Detached Group",
    group: "Detached Group",
    room: "Chapel",
    modeType: "In Person",
    isRecurring: false,
    startDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
    splitFromMid: root.mid,
  });
  seededGroups.push("Detached Group");

  const response = await GET();
  const csv = await response.text();

  expect(rowCountFor(csv, "Detached Group")).toBe(1);
  // "Meeting Day" reads formatDayColumn(recurrencePattern) -- the series' actual day, not
  // "One-time", confirms the recurring parent won, not the detached child.
  expect(columnValueFor(csv, "Detached Group", "Meeting Day")).toBe("Mon");
  expect(columnValueFor(csv, "Detached Group", "Room")).toBe("Serenity Room ($15/hr)");
  expect(rentChargeFor(csv, "Detached Group")).toBe("$60.00");
});

// A lineage where every member is a one-time row (no recurrencePattern at all) has no recurring
// member to restrict the pick to -- pickLineageRepresentative must fall back to latest-starting
// across the whole group rather than returning nothing/throwing. Not a shape #497 currently
// produces (a detached child always keeps its recurring parent around), but the function should
// still degrade sensibly if that ever changes.
test("all-one-time lineage: falls back to latest-starting across the whole group", async () => {
  await seedLeaseSettings({ rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }, { room: "Chapel", rate: 20, unit: "hr" }] });
  const root = await seedMeeting({
    title: "OneTime Group",
    group: "OneTime Group",
    room: "Serenity Room",
    modeType: "In Person",
    isRecurring: false,
    startDateTime: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  });
  await seedMeeting({
    title: "OneTime Group",
    group: "OneTime Group",
    room: "Chapel",
    modeType: "In Person",
    isRecurring: false,
    startDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    splitFromMid: root.mid,
  });
  seededGroups.push("OneTime Group");

  const response = await GET();
  const csv = await response.text();

  expect(rowCountFor(csv, "OneTime Group")).toBe(1);
  expect(columnValueFor(csv, "OneTime Group", "Room")).toBe("Chapel ($20/hr)");
});

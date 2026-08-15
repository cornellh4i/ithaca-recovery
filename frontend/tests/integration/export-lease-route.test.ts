jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { email: "admin@icr.test", role: "SUPER_ADMIN" },
    accessToken: "fake-token",
  }),
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting } from "../factories/meeting";
import { seedLeaseSettings } from "../factories/leaseSettings";
import { GET } from "../../app/api/export/lease/route";

afterAll(async () => {
  await disconnectTestPrismaClient();
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

test("calculateRentCharge: non-monthly room uses a flat 4 weeks/month, monthly room and Zoom Only return the flat rate", async () => {
  const prisma = getTestPrismaClient();

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

  const response = await GET();
  expect(response.status).toBe(200);
  const csv = await response.text();

  expect(rentChargeFor(csv, "Hourly Group")).toBe("$60.00");
  expect(rentChargeFor(csv, "Monthly Group")).toBe("$500.00");
  expect(rentChargeFor(csv, "Remote Group")).toBe("$25.00");

  await prisma.meeting.deleteMany({ where: { group: { in: ["Hourly Group", "Monthly Group", "Remote Group"] } } });
  await prisma.leaseSettings.deleteMany();
});

// formatTime() reads Meeting.startDateTime/endDateTime (real UTC instants) in ET, not UTC --
// seedMeeting's default 6:00-7:00 PM ET start/end exercises this directly, since reading the
// UTC hour instead would show a different time (4-5 hours off, DST-dependent).
test("formatTime: Start/End Time columns show the meeting's ET wall-clock time, not its UTC hour", async () => {
  const prisma = getTestPrismaClient();

  await seedLeaseSettings({ rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }] });
  await seedMeeting({
    title: "Time Group",
    group: "Time Group",
    room: "Serenity Room",
    modeType: "In Person",
  });

  const response = await GET();
  expect(response.status).toBe(200);
  const csv = await response.text();

  expect(columnValueFor(csv, "Time Group", "Start Time")).toBe("6:00 PM");
  expect(columnValueFor(csv, "Time Group", "End Time")).toBe("7:00 PM");

  await prisma.meeting.deleteMany({ where: { group: "Time Group" } });
  await prisma.leaseSettings.deleteMany();
});

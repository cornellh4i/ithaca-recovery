jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { email: "admin@icr.test", role: "SUPER_ADMIN" },
    accessToken: "fake-token",
  }),
}));

import * as XLSX from "xlsx";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { GET } from "../../app/api/export/meetings/route";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

// Same rationale as export-lease-route.test.ts: no per-file DB reset, and the route fetches
// every non-deleted meeting, so leftover rows from a failed assertion would leak into the next
// test's row count.
let seededGroups: string[] = [];

afterEach(async () => {
  const prisma = getTestPrismaClient();
  if (seededGroups.length > 0) {
    await prisma.recurrencePattern.deleteMany({ where: { meeting: { group: { in: seededGroups } } } });
    await prisma.meeting.deleteMany({ where: { group: { in: seededGroups } } });
    seededGroups = [];
  }
});

interface XlsxRow {
  [column: string]: string;
}

async function rowsFor(response: Response): Promise<XlsxRow[]> {
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<XlsxRow>(sheet);
}

test("plain recurring series: one row, Series End blank (open-ended) and Split From blank", async () => {
  await seedRecurringMeeting({ title: "Open Series", group: "Open Series", room: "Serenity Room" });
  seededGroups.push("Open Series");

  const response = await GET();
  expect(response.status).toBe(200);
  const rows = await rowsFor(response);
  const row = rows.find((r) => r["Meeting Name"] === "Open Series");

  expect(row).toBeDefined();
  expect(row?.["Series End"] ?? "").toBe("");
  expect(row?.["Split From"] ?? "").toBe("");
});

// A "this" delete pushes an ET-day-start instant onto RecurrencePattern.excludedDates without
// touching endDate -- the XLSX export doesn't expand occurrences at all (that's the flagged,
// not-fixed audit finding), so this still shows as a single open-ended row exactly like the
// unexcluded case above; the exclusion itself has no visible effect on this export's Series End.
test("excluded occurrence: series with excludedDates still shows a blank Series End", async () => {
  await seedRecurringMeeting(
    { title: "Excluded Series", group: "Excluded Series", room: "Serenity Room" },
    { excludedDates: [new Date()] },
  );
  seededGroups.push("Excluded Series");

  const response = await GET();
  const rows = await rowsFor(response);
  const row = rows.find((r) => r["Meeting Name"] === "Excluded Series");

  expect(row?.["Series End"] ?? "").toBe("");
});

// A "this and following" delete trims RecurrencePattern.endDate in place -- Series End should
// surface that trim date directly.
test("trimmed series: Series End reflects the trimmed recurrencePattern.endDate", async () => {
  const { meeting } = await seedRecurringMeeting({
    title: "Trimmed Series",
    group: "Trimmed Series",
    room: "Serenity Room",
  });
  // Noon UTC, not midnight -- midnight UTC is still the previous calendar day in ET (UTC-4/-5),
  // which would make this assert the wrong date regardless of DST (see project's local-timezone
  // prevention rule).
  const trimDate = new Date(Date.UTC(2027, 2, 15, 12));
  await getTestPrismaClient().recurrencePattern.update({
    where: { mid: meeting.mid },
    data: { endDate: trimDate },
  });
  seededGroups.push("Trimmed Series");

  const response = await GET();
  const rows = await rowsFor(response);
  const row = rows.find((r) => r["Meeting Name"] === "Trimmed Series");

  expect(row?.["Series End"]).toBe("03/15/2027");
});

// #497 split pair: unlike the Lease CSV (one combined billing row), the XLSX export keeps both
// segments as their own row -- each is a real distinct schedule -- with Split From linking the
// tail back to the root's mid.
test("split pair (thisAndFollowing tail): two rows, tail carries Split From back to the root", async () => {
  const { meeting: root } = await seedRecurringMeeting({
    title: "Split Series",
    group: "Split Series",
    room: "Serenity Room",
    startDateTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  });
  await getTestPrismaClient().recurrencePattern.update({
    where: { mid: root.mid },
    data: { endDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
  });
  await seedRecurringMeeting({
    title: "Split Series",
    group: "Split Series",
    room: "Chapel",
    startDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    splitFromMid: root.mid,
  });
  seededGroups.push("Split Series");

  const response = await GET();
  const rows = await rowsFor(response).then((r) => r.filter((row) => row["Meeting Name"] === "Split Series"));

  expect(rows).toHaveLength(2);
  const rootRow = rows.find((r) => r["Physical Room"] === "Serenity Room");
  const tailRow = rows.find((r) => r["Physical Room"] === "Chapel");
  expect(rootRow?.["Split From"] ?? "").toBe("");
  expect(tailRow?.["Split From"]).toBe(root.mid);
});

// #497 "this" edit: the detached one-time row has no recurrencePattern at all, so Series End is
// blank on it even though it's part of a lineage that did have a series -- Split From is what
// actually links it back.
test("split pair (this detached occurrence): detached row has blank Series End but populated Split From", async () => {
  const { meeting: root } = await seedRecurringMeeting({
    title: "Detached Series",
    group: "Detached Series",
    room: "Serenity Room",
  });
  await seedMeeting({
    title: "Detached Series",
    group: "Detached Series",
    room: "Serenity Room",
    isRecurring: false,
    startDateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    endDateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    splitFromMid: root.mid,
  });
  seededGroups.push("Detached Series");

  const response = await GET();
  const rows = await rowsFor(response).then((r) => r.filter((row) => row["Meeting Name"] === "Detached Series"));

  expect(rows).toHaveLength(2);
  const detachedRow = rows.find((r) => r["Split From"] === root.mid);
  expect(detachedRow).toBeDefined();
  expect(detachedRow?.["Series End"] ?? "").toBe("");
});

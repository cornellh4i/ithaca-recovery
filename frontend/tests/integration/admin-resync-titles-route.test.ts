jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "ADMIN" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  reconcileMeetingCalendars: jest.fn(),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  updateZoomMeeting: jest.fn(),
  getZoomMeetingCredentials: jest.fn(),
  getZoomMeetingInvitation: jest.fn(),
  getZoomHostCapacities: jest.fn().mockResolvedValue({}),
  resolveZoomHost: jest.fn(),
  zoomHostPool: ["mock-pool-host-1@icr.test", "mock-pool-host-2@icr.test"],
  zoomRoomCalendarId: {},
}));

import { randomUUID } from "crypto";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { buildMeetingData } from "../factories/meeting";
import { POST } from "../../app/api/admin/resync-titles/route";
import { updateZoomMeeting, getZoomMeetingCredentials } from "../../services/zoom";
import { reconcileMeetingCalendars } from "../../services/googleCalendar";

const mockedUpdateZoomMeeting = updateZoomMeeting as jest.Mock;
const mockedGetZoomMeetingCredentials = getZoomMeetingCredentials as jest.Mock;
const mockedReconcileMeetingCalendars = reconcileMeetingCalendars as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedUpdateZoomMeeting.mockReset();
  mockedGetZoomMeetingCredentials.mockReset();
  mockedReconcileMeetingCalendars.mockReset();
});

const postSweep = (body: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/admin/resync-titles", {
    method: "POST",
    body: JSON.stringify(body),
  }));

// A distinct title per test run keeps these rows from colliding with each other or with other
// suites sharing the same database.
const seedSyncedMeeting = async (overrides: Record<string, unknown> = {}) => {
  const prisma = getTestPrismaClient();
  return prisma.meeting.create({
    data: buildMeetingData({
      title: `Sweep Meeting ${randomUUID()}`,
      modeType: "Remote",
      room: "",
      zid: randomUUID(),
      googleSyncStatus: "synced",
      zoomSyncStatus: "synced",
      ...overrides,
    }),
  });
};

// Walks the whole cursor chain for one mid's row -- other suites' rows share the table, so
// the batch holding a seeded mid may not be the first.
async function findSweepRow(mid: string, dryRun: boolean): Promise<Record<string, unknown> | undefined> {
  let cursor: string | null = null;
  do {
    const response: Response = await postSweep({ dryRun, limit: 25, ...(cursor ? { cursor } : {}) });
    expect(response.status).toBe(200);
    const body = await response.json();
    const row = body.results.find((r: { mid: string }) => r.mid === mid);
    if (row) return row;
    cursor = body.nextCursor;
  } while (cursor);
  return undefined;
}

test("dry run previews the new prefixed titles without touching Zoom or the calendars", async () => {
  const meeting = await seedSyncedMeeting({ calType: ["AA", "Other"], fellowship: "NA" });

  const row = await findSweepRow(meeting.mid, true);
  expect(row?.newTitle).toBe(`AA/NA ${meeting.title} - Zoom Only`);
  expect(mockedUpdateZoomMeeting).not.toHaveBeenCalled();
  expect(mockedReconcileMeetingCalendars).not.toHaveBeenCalled();
});

test("dry run is the default -- an empty body never executes", async () => {
  await seedSyncedMeeting();
  const response = await postSweep({});
  expect((await response.json()).dryRun).toBe(true);
  expect(mockedUpdateZoomMeeting).not.toHaveBeenCalled();
});

test("execution runs the shared full reconcile per row (Zoom PATCH + calendar rewrite)", async () => {
  const meeting = await seedSyncedMeeting({ calType: ["AA"] });
  mockedGetZoomMeetingCredentials.mockResolvedValue(null);
  mockedUpdateZoomMeeting.mockResolvedValue(true);
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: { AA: "evt-1" }, allSynced: true });

  // Scoped by mids: parallel suites share this database, and executing a whole-table sweep
  // here would rewrite their rows' sync statuses mid-test.
  const response = await postSweep({ dryRun: false, mids: [meeting.mid] });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.nextCursor).toBeNull();
  const row = body.results.find((r: { mid: string }) => r.mid === meeting.mid);
  expect(row?.zoomSyncStatus).toBe("synced");
  expect(row?.googleSyncStatus).toBe("synced");
  // The row's Zoom PATCH went out with the row itself (topic derivation is covered by
  // tests/unit/zoom.test.ts; here we only care the shared reconcile actually ran).
  expect(mockedUpdateZoomMeeting.mock.calls.some(([zid]) => zid === meeting.zid)).toBe(true);
});

test("a pinned zoomTopic is surfaced so the reviewer knows Zoom keeps its verbatim name", async () => {
  const meeting = await seedSyncedMeeting({ zoomTopic: "ICR Legacy Zoom Name" });
  const row = await findSweepRow(meeting.mid, true);
  expect(row?.pinnedZoomTopic).toBe("ICR Legacy Zoom Name");
});

test("soft-deleted and Suspended rows are excluded from the sweep", async () => {
  const deleted = await seedSyncedMeeting({ deletedAt: new Date() });
  const suspended = await seedSyncedMeeting({ status: "Suspended" });

  let cursor: string | null = null;
  const seen: string[] = [];
  do {
    const body: { results: { mid: string }[]; nextCursor: string | null } =
      await (await postSweep({ dryRun: true, limit: 25, ...(cursor ? { cursor } : {}) })).json();
    seen.push(...body.results.map((r) => r.mid));
    cursor = body.nextCursor;
  } while (cursor);

  expect(seen).not.toContain(deleted.mid);
  expect(seen).not.toContain(suspended.mid);
});

import { randomUUID } from "crypto";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import type { IMeeting } from "../../util/models";

// Next's after() throws when called outside a real request scope, which route handlers
// invoked directly (not through the Next server) always are. The sync promise passed to
// after() has already started executing by the time after() runs, so a no-op mock here
// doesn't change what actually happens — only silences that scope check for this test.
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: () => {},
}));

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "ADMIN" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdsForMeeting: jest.fn().mockReturnValue({ AA: "fake-calendar-id" }),
  createCalendarEvent: jest.fn(),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  getZoomMeetingInvitation: jest.fn(),
  resolveZoomHost: jest.fn(),
  zoomRoomCalendarId: {},
}));

import { createCalendarEvent } from "../../services/googleCalendar";
import { resolveZoomHost } from "../../services/zoom";
import { POST } from "../../app/api/write/meeting/route";

const mockedCreateCalendarEvent = createCalendarEvent as jest.Mock;
const mockedResolveZoomHost = resolveZoomHost as jest.Mock;

function buildMeetingPayload(overrides: Partial<IMeeting> = {}): IMeeting {
  return {
    mid: `m-${randomUUID()}`,
    title: "Route Timing Meeting",
    modeType: "In Person",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: new Date("2026-08-01T22:00:00Z"),
    endDateTime: new Date("2026-08-01T23:00:00Z"),
    email: "route-test@test.icr",
    zoomRoom: "",
    calType: ["AA"],
    status: "Active",
    room: "Serenity Room",
    isRecurring: false,
    ...overrides,
  };
}

afterAll(async () => {
  await disconnectTestPrismaClient();
});

// Neither jest config sets clearMocks/resetMocks globally, and mockImplementation set in one
// test (e.g. the 300ms-delayed createCalendarEvent below) otherwise leaks into later tests —
// which previously made the Zoom-pool-exhaustion test below flaky, since the leftover GCal
// delay pushed syncNewMeeting's background work past that test's own wait window.
beforeEach(() => {
  mockedCreateCalendarEvent.mockReset();
  mockedResolveZoomHost.mockReset();
});

test("the response resolves before Google Calendar sync completes, which runs in the background", async () => {
  const SYNC_DELAY_MS = 300;
  mockedCreateCalendarEvent.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve("fake-event-id"), SYNC_DELAY_MS)),
  );

  const payload = buildMeetingPayload();
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const start = Date.now();
  const response = await POST(request);
  const elapsed = Date.now() - start;

  expect(response.status).toBe(201);
  expect(elapsed).toBeLessThan(SYNC_DELAY_MS);

  const prisma = getTestPrismaClient();
  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(rightAfterResponse?.syncStatus).toBeNull();

  // waitUntil has no real lifecycle hook outside Vercel, but the background
  // function still runs to completion on its own — just give it time to finish.
  await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS + 100));
  const afterSync = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(afterSync?.syncStatus).toBe("synced");
});

test("a resolved Zoom host is persisted synchronously, before the deferred sync runs", async () => {
  mockedResolveZoomHost.mockResolvedValue("host@icr.test");
  const SYNC_DELAY_MS = 300;
  mockedCreateCalendarEvent.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve("fake-event-id"), SYNC_DELAY_MS)),
  );

  const payload = buildMeetingPayload({ modeType: "Hybrid", zoomRoom: "Serenity Room - Zoom" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  // The host must already be committed to the DB row by the time the response comes back —
  // that's the whole point of resolving it before the initial create rather than inside the
  // deferred after() job, which here is still 300ms away from even starting its Zoom work.
  const prisma = getTestPrismaClient();
  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(rightAfterResponse?.zoomHost).toBe("host@icr.test");

  await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS + 100));
});

test("a malformed body returns 400 with validation issues instead of a raw 500", async () => {
  const malformed = buildMeetingPayload({ email: "not-an-email" });
  // @ts-expect-error - deliberately wrong type to trigger schema validation, not a DB error
  malformed.calType = "AA";

  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(malformed),
  });

  const response = await POST(request);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toBe("Invalid meeting data");
  expect(Array.isArray(body.issues)).toBe(true);
  expect(body.issues.length).toBeGreaterThan(0);

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: malformed.mid } });
  expect(created).toBeNull();
});

test("an exhausted Zoom host pool fails soft: the meeting is still created", async () => {
  mockedResolveZoomHost.mockResolvedValue(null);

  const payload = buildMeetingPayload({ modeType: "Hybrid", zoomRoom: "Serenity Room - Zoom" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  // Pool exhaustion is detected synchronously (resolveZoomHost runs before the initial
  // create), so the error status is already on the row before the deferred sync ever runs.
  const prisma = getTestPrismaClient();
  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(rightAfterResponse?.zoomHost).toBeNull();
  expect(rightAfterResponse?.zoomSyncStatus).toBe("error");
  expect(rightAfterResponse?.zoomSyncError).toMatch(/pool exhausted/i);

  // waitUntil has no real lifecycle hook outside Vercel, but the background
  // function still runs to completion on its own — just give it time to finish.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const afterSync = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(afterSync?.zid).toBeNull();
  expect(afterSync?.zoomHost).toBeNull();
  expect(afterSync?.zoomSyncStatus).toBe("error");
  expect(afterSync?.zoomSyncError).toMatch(/pool exhausted/i);
});

import { randomUUID } from "crypto";
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
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  reconcileMeetingCalendars: jest.fn(),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  updateZoomMeeting: jest.fn(),
  deleteZoomMeeting: jest.fn(),
  resolveZoomHost: jest.fn(),
  zoomRoomCalendarId: {},
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { PUT } from "../../app/api/update/meeting/route";
import { updateZoomMeeting, createZoomMeeting, resolveZoomHost } from "../../services/zoom";
import { reconcileMeetingCalendars } from "../../services/googleCalendar";

const mockedUpdateZoomMeeting = updateZoomMeeting as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedResolveZoomHost = resolveZoomHost as jest.Mock;
const mockedReconcileMeetingCalendars = reconcileMeetingCalendars as jest.Mock;

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

test("a malformed body returns 400 with validation issues instead of a raw 500", async () => {
  const malformed = buildMeetingPayload({ email: "not-an-email" });
  // @ts-expect-error - deliberately wrong type to trigger schema validation, not a DB error
  malformed.calType = "AA";

  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(malformed),
  });

  const response = await PUT(request);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toBe("Invalid meeting data");
  expect(Array.isArray(body.issues)).toBe(true);
  expect(body.issues.length).toBeGreaterThan(0);

  // Confirms the 400 came from schema validation before ever touching the DB
  // (the route's "not found" 404 path is a distinct, later check).
  const prisma = getTestPrismaClient();
  const found = await prisma.meeting.findUnique({ where: { mid: malformed.mid } });
  expect(found).toBeNull();
});

test("a same-room time edit that now conflicts with another meeting on the same Zoom host fails soft instead of double-booking it", async () => {
  mockedUpdateZoomMeeting.mockClear();
  mockedUpdateZoomMeeting.mockResolvedValue(true);
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const sharedHost = "pooled-host@icr.org";

  // Occupies the shared host at the *new* time we're about to move the edited meeting into —
  // a different room, since this is a host conflict, not a room conflict.
  const busyMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp1, ...busyMeetingData } = buildMeetingPayload({
    mid: busyMid,
    room: "Fellowship Room",
    zoomRoom: "Fellowship Room - Zoom",
    zid: "zid-busy",
    zoomHost: sharedHost,
    startDateTime: new Date("2026-09-01T20:00:00Z"),
    endDateTime: new Date("2026-09-01T21:00:00Z"),
  });
  await prisma.meeting.create({ data: busyMeetingData });

  const editedMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp2, ...editedMeetingData } = buildMeetingPayload({
    mid: editedMid,
    room: "Serenity Room",
    zoomRoom: "Serenity Room - Zoom",
    zid: "zid-edited",
    zoomHost: sharedHost,
    startDateTime: new Date("2026-09-01T15:00:00Z"),
    endDateTime: new Date("2026-09-01T16:00:00Z"),
  });
  await prisma.meeting.create({ data: editedMeetingData });

  // Same room/Zoom room/host as before — only the time moves, into busyMid's window.
  const payload = buildMeetingPayload({
    mid: editedMid,
    room: "Serenity Room",
    zoomRoom: "Serenity Room - Zoom",
    zid: "zid-edited",
    zoomHost: sharedHost,
    startDateTime: new Date("2026-09-01T20:30:00Z"),
    endDateTime: new Date("2026-09-01T21:30:00Z"),
  });

  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  // waitUntil has no real lifecycle hook outside Vercel, but the background
  // function still runs to completion on its own — just give it time to finish.
  await new Promise((resolve) => setTimeout(resolve, 400));

  expect(mockedUpdateZoomMeeting).not.toHaveBeenCalled();

  const afterSync = await prisma.meeting.findUnique({ where: { mid: editedMid } });
  expect(afterSync?.zid).toBe("zid-edited");
  expect(afterSync?.zoomHost).toBe(sharedHost);
  expect(afterSync?.zoomSyncStatus).toBe("error");
  expect(afterSync?.zoomSyncError).toMatch(/conflicts with another meeting/i);
});

test("a newly resolved Zoom host is persisted synchronously when a meeting first gets a Zoom room", async () => {
  mockedResolveZoomHost.mockReset().mockResolvedValue("new-host@icr.test");
  const SYNC_DELAY_MS = 300;
  mockedCreateZoomMeeting.mockReset().mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve({ zid: "new-zid", zoomLink: "http://zoom.test/new" }), SYNC_DELAY_MS)),
  );
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const mid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({ mid, zoomRoom: "" });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = buildMeetingPayload({ mid, zoomRoom: "Serenity Room - Zoom" });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  // The host must already be committed to the DB row by the time the response comes back —
  // createZoomMeeting is still 300ms away from resolving, so this can only pass if the host
  // was resolved and persisted in the initial synchronous update, not inside the deferred job.
  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid } });
  expect(rightAfterResponse?.zoomHost).toBe("new-host@icr.test");

  await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS + 100));
});

test("an exhausted Zoom host pool on update fails soft, synchronously, without touching the existing meeting fields", async () => {
  mockedResolveZoomHost.mockReset().mockResolvedValue(null);
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const mid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({ mid, zoomRoom: "" });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = buildMeetingPayload({ mid, zoomRoom: "Serenity Room - Zoom" });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid } });
  expect(rightAfterResponse?.zoomHost).toBeNull();
  expect(rightAfterResponse?.zoomSyncStatus).toBe("error");
  expect(rightAfterResponse?.zoomSyncError).toMatch(/pool exhausted/i);

  await new Promise((resolve) => setTimeout(resolve, 100));
});

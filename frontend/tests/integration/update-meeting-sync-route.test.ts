import type { Prisma } from "@prisma/client";

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
  getZoomMeetingInvitation: jest.fn(),
  resolveZoomHost: jest.fn(),
  // resolveZoomHost itself is mocked (its result is controlled per-test below), but the route
  // now locks every pool host via lockResourceClaims (the real implementation, not mocked)
  // before calling it -- needs real string values to lock, not the real env-derived pool.
  zoomHostPool: ["mock-pool-host-1@icr.test", "mock-pool-host-2@icr.test"],
  zoomRoomCalendarId: {},
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { buildMeetingData as buildBaseMeetingData } from "../factories/meeting";
import { POST } from "../../app/api/update/meeting/sync/route";
import { resolveZoomHost, createZoomMeeting, updateZoomMeeting } from "../../services/zoom";
import { reconcileMeetingCalendars } from "../../services/googleCalendar";

const mockedResolveZoomHost = resolveZoomHost as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedUpdateZoomMeeting = updateZoomMeeting as jest.Mock;
const mockedReconcileMeetingCalendars = reconcileMeetingCalendars as jest.Mock;

function buildMeetingData(overrides: Partial<Prisma.MeetingCreateInput> = {}) {
  return buildBaseMeetingData({
    title: "Retry Sync Meeting",
    modeType: "Remote",
    room: "",
    googleSyncStatus: "pending",
    zoomSyncStatus: "error",
    zoomSyncError: "No Zoom host available for this meeting's schedule (pool exhausted).",
    ...overrides,
  });
}

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedResolveZoomHost.mockReset();
  mockedCreateZoomMeeting.mockReset();
  mockedUpdateZoomMeeting.mockReset();
  mockedReconcileMeetingCalendars.mockReset();
});

test("a retry that newly succeeds at getting a host both creates the Zoom meeting and publishes the previously-deferred calendar reconcile", async () => {
  mockedResolveZoomHost.mockResolvedValue("host@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: "retried-zid", zoomLink: "http://zoom.test/retried", zoomPasscode: null });
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: { AA: "fake-event-id" }, allSynced: true });

  const prisma = getTestPrismaClient();
  const meetingData = buildMeetingData();
  await prisma.meeting.create({ data: meetingData });

  const request = new Request("http://localhost/api/update/meeting/sync", {
    method: "POST",
    body: JSON.stringify({ mid: meetingData.mid }),
  });

  const response = await POST(request);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.googleSyncStatus).toBe("synced");
  expect(body.zoomSyncStatus).toBe("synced");

  // The calendar reconcile is called with the newly-resolved zoomLink, not the stale null one
  // the meeting had while blocked.
  expect(mockedReconcileMeetingCalendars).toHaveBeenCalledWith(
    "fake-token",
    expect.objectContaining({ zoomLink: "http://zoom.test/retried" }),
    {},
  );

  const afterRetry = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
  expect(afterRetry?.zid).toBe("retried-zid");
  expect(afterRetry?.googleSyncStatus).toBe("synced");
  expect(afterRetry?.googleCalendarEventIds).toEqual({ AA: "fake-event-id" });
});

test("a retry that still can't get a host stays pending and does not attempt the calendar reconcile", async () => {
  mockedResolveZoomHost.mockResolvedValue(null);

  const prisma = getTestPrismaClient();
  const meetingData = buildMeetingData();
  await prisma.meeting.create({ data: meetingData });

  const request = new Request("http://localhost/api/update/meeting/sync", {
    method: "POST",
    body: JSON.stringify({ mid: meetingData.mid }),
  });

  const response = await POST(request);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.googleSyncStatus).toBe("pending");
  expect(body.zoomSyncError).toMatch(/pool exhausted/i);
  expect(mockedReconcileMeetingCalendars).not.toHaveBeenCalled();

  const afterRetry = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
  expect(afterRetry?.googleSyncStatus).toBe("pending");
});

// #360: the pool-host reservation (lock the pool, resolve, persist zoomHost) must commit BEFORE
// the external Zoom API call, and must survive that call failing -- otherwise a failed retry
// would silently free the host it just reserved, letting a concurrent request take it while this
// meeting's own zoomSyncError still claims pool exhaustion.
test("a retry reserves the resolved pool host before calling the Zoom API, and keeps the reservation even if that call fails", async () => {
  const prisma = getTestPrismaClient();
  const meetingData = buildMeetingData();
  await prisma.meeting.create({ data: meetingData });

  mockedResolveZoomHost.mockResolvedValue("reserved-host@icr.test");
  mockedCreateZoomMeeting.mockImplementation(async () => {
    // The reservation transaction must already have committed by the time this external call
    // fires -- assert the DB reflects it, not just that resolveZoomHost returned a value.
    const duringCall = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
    expect(duringCall?.zoomHost).toBe("reserved-host@icr.test");
    return null; // simulate the external Zoom API call itself failing
  });

  const request = new Request("http://localhost/api/update/meeting/sync", {
    method: "POST",
    body: JSON.stringify({ mid: meetingData.mid }),
  });

  const response = await POST(request);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.zoomSyncStatus).toBe("error");
  expect(body.zoomSyncError).toMatch(/failed to create the zoom meeting/i);

  const afterRetry = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
  expect(afterRetry?.zoomHost).toBe("reserved-host@icr.test");
});

// BUG-023: zoomBlocking must key off the *resulting* zoomSyncStatus, not off "does a zid
// already exist" -- an already-synced meeting's zid persists across retries regardless of
// whether this retry itself succeeds, so !zid alone can't tell the two cases apart.
describe("retrying an already-synced meeting (existing zid)", () => {
  function buildSyncedMeetingData(overrides: Partial<Prisma.MeetingCreateInput> = {}) {
    return buildMeetingData({
      title: "Already Synced Meeting",
      modeType: "Remote",
      room: "",
      zid: "existing-zid",
      zoomLink: "http://zoom.test/existing",
      zoomHost: "host@icr.test",
      googleSyncStatus: "synced",
      zoomSyncStatus: "synced",
      zoomSyncError: null,
      ...overrides,
    });
  }

  test("a real Zoom API success keeps the meeting synced and still runs the calendar reconcile (first-come-first-served: no conflict pre-check downgrades an unchanged, already-working meeting)", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const meetingData = buildSyncedMeetingData();
    await prisma.meeting.create({ data: meetingData });

    const request = new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.zoomSyncStatus).toBe("synced");
    expect(body.googleSyncStatus).toBe("synced");

    expect(mockedUpdateZoomMeeting).toHaveBeenCalledWith("existing-zid", expect.anything());
    expect(mockedReconcileMeetingCalendars).toHaveBeenCalled();
  });

  test("a real Zoom API failure marks zoomSyncStatus error and defers the calendar reconcile", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(false);

    const prisma = getTestPrismaClient();
    const meetingData = buildSyncedMeetingData();
    await prisma.meeting.create({ data: meetingData });

    const request = new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.zoomSyncStatus).toBe("error");
    expect(body.googleSyncStatus).toBe("pending");
    expect(mockedReconcileMeetingCalendars).not.toHaveBeenCalled();
  });
});

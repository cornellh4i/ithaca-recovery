import { randomUUID } from "crypto";
import type { Meeting } from "@prisma/client";

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
  zoomRoomCalendarId: {},
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { POST } from "../../app/api/update/meeting/sync/route";
import { resolveZoomHost, createZoomMeeting } from "../../services/zoom";
import { reconcileMeetingCalendars } from "../../services/googleCalendar";

const mockedResolveZoomHost = resolveZoomHost as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedReconcileMeetingCalendars = reconcileMeetingCalendars as jest.Mock;

function buildMeetingData(overrides: Partial<Meeting> = {}) {
  return {
    mid: `m-${randomUUID()}`,
    title: "Retry Sync Meeting",
    modeType: "Remote",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: new Date("2026-08-01T22:00:00Z"),
    endDateTime: new Date("2026-08-01T23:00:00Z"),
    email: "route-test@test.icr",
    zoomRoom: null,
    calType: ["AA"],
    status: "Active",
    room: "",
    isRecurring: false,
    syncStatus: "pending",
    zoomSyncStatus: "error",
    zoomSyncError: "No Zoom host available for this meeting's schedule (pool exhausted).",
    ...overrides,
  };
}

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedResolveZoomHost.mockReset();
  mockedCreateZoomMeeting.mockReset();
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
  expect(body.syncStatus).toBe("synced");
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
  expect(afterRetry?.syncStatus).toBe("synced");
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
  expect(body.syncStatus).toBe("pending");
  expect(body.zoomSyncError).toMatch(/pool exhausted/i);
  expect(mockedReconcileMeetingCalendars).not.toHaveBeenCalled();

  const afterRetry = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
  expect(afterRetry?.syncStatus).toBe("pending");
});

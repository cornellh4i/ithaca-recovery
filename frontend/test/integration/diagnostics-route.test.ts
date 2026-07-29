import { randomUUID } from "crypto";
import type { Meeting } from "@prisma/client";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { email: "admin@icr.test", role: "ADMIN" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdForCategory: { AA: "fake-cal-id" },
  checkCalendarReachable: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/zoom", () => ({
  checkZoomReachable: jest.fn().mockResolvedValue(true),
  zoomRoomCalendarId: {},
  checkZoomHostPool: jest.fn().mockResolvedValue({}),
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { GET } from "../../app/api/admin/diagnostics/route";

function buildMeetingData(overrides: Partial<Meeting> = {}) {
  return {
    mid: `m-${randomUUID()}`,
    title: "Diagnostics Count Meeting",
    modeType: "In Person",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: new Date("2026-08-01T22:00:00Z"),
    endDateTime: new Date("2026-08-01T23:00:00Z"),
    email: "route-test@test.icr",
    zoomRoom: null,
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

test("counts a Remote meeting's Zoom sync error even though it has no zoomRoom", async () => {
  const prisma = getTestPrismaClient();

  // Regression case: gating this count on zoomRoom truthy (the old behavior) would silently
  // exclude this meeting, since Remote meetings no longer have a zoomRoom.
  await prisma.meeting.create({
    data: buildMeetingData({
      modeType: "Remote",
      room: "",
      zoomSyncStatus: "error",
    }),
  });
  await prisma.meeting.create({
    data: buildMeetingData({
      modeType: "Hybrid",
      zoomRoom: "Serenity Room - Zoom",
      syncStatus: "pending",
    }),
  });

  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();

  expect(body.meetingCounts.zoomSyncErrors).toBeGreaterThanOrEqual(1);
  expect(body.meetingCounts.pendingZoomSync).toBeGreaterThanOrEqual(1);
});

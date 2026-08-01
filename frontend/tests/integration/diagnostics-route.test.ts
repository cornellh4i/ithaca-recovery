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
import { buildMeetingData as buildBaseMeetingData } from "../factories/meeting";
import { GET } from "../../app/api/admin/diagnostics/route";

function buildMeetingData(overrides: Partial<Meeting> = {}) {
  return buildBaseMeetingData({ title: "Diagnostics Count Meeting", ...overrides });
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
      zoomSyncError: "No Zoom host available for this meeting's schedule (pool exhausted).",
    }),
  });
  await prisma.meeting.create({
    data: buildMeetingData({
      modeType: "Hybrid",
      zoomRoom: "Serenity Room - Zoom",
      googleSyncStatus: "pending",
    }),
  });

  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();

  expect(body.meetingCounts.zoomSyncErrors).toBeGreaterThanOrEqual(1);
  expect(body.meetingCounts.pendingZoomSync).toBeGreaterThanOrEqual(1);

  // Same regression, but for the actual list of affected meetings (not just the counts) --
  // an admin needs to be able to find *which* meeting has the problem, not just how many.
  const remoteIssue = body.syncIssues.find((s: { title: string; modeType: string }) => s.title === "Diagnostics Count Meeting" && s.modeType === "Remote");
  expect(remoteIssue.issues.some((i: string) => i.includes("Zoom sync failed"))).toBe(true);

  const pendingIssue = body.syncIssues.find((s: { modeType: string }) => s.modeType === "Hybrid");
  expect(pendingIssue.issues.some((i: string) => i.includes("Waiting on a Zoom host"))).toBe(true);
});

test("a stale zoomSyncStatus on an In Person meeting doesn't surface as a sync issue", async () => {
  const prisma = getTestPrismaClient();

  // Only Hybrid/Remote meetings ever attempt a real Zoom sync under the current mode-based
  // gate -- a leftover "error" on an In Person meeting (e.g. from before that gate existed)
  // shouldn't be listed as something to retry, since retrying it wouldn't attempt Zoom at all.
  const mid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: buildMeetingData({ mid, modeType: "In Person", zoomSyncStatus: "error" }),
  });

  const response = await GET();
  const body = await response.json();

  expect(body.syncIssues.find((s: { mid: string }) => s.mid === mid)).toBeUndefined();
});

test("a meeting with a suspension scheduled for a future date shows up in the suspended panel, marked not yet active", async () => {
  const prisma = getTestPrismaClient();

  // Suspended today for the "currently suspended" split (active/suspended counts), but the
  // suspension itself doesn't start until next week -- the old isDateSuspended(today)-only
  // filter wouldn't have picked this up for the panel at all.
  const mid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: buildMeetingData({ mid, status: "Suspended" }),
  });
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.suspensionPeriod.create({ data: { mid, from: future, to: null } });

  const response = await GET();
  const body = await response.json();

  const row = body.suspendedMeetings.find((m: { mid: string }) => m.mid === mid);
  expect(row).toBeDefined();
  expect(row.suspensionActive).toBe(false);
  expect(new Date(row.suspendedSince).toISOString()).toBe(future.toISOString());
});

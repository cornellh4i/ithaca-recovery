import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";

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
import { GET as getMeetingCounts } from "../../app/api/admin/diagnostics/meeting-counts/route";
import { GET as getSyncIssues } from "../../app/api/admin/diagnostics/sync-issues/route";
import { GET as getSuspended } from "../../app/api/admin/diagnostics/suspended/route";

function buildMeetingData(overrides: Partial<Prisma.MeetingCreateInput> = {}) {
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

  const countsResponse = await getMeetingCounts();
  expect(countsResponse.status).toBe(200);
  const counts = await countsResponse.json();

  expect(counts.zoomSyncErrors).toBeGreaterThanOrEqual(1);
  expect(counts.pendingZoomSync).toBeGreaterThanOrEqual(1);

  // Same regression, but for the actual list of affected meetings (not just the counts) --
  // an admin needs to be able to find *which* meeting has the problem, not just how many.
  const syncIssuesResponse = await getSyncIssues();
  const { syncIssues } = await syncIssuesResponse.json();

  const remoteIssue = syncIssues.find((s: { title: string; modeType: string }) => s.title === "Diagnostics Count Meeting" && s.modeType === "Remote");
  expect(remoteIssue).toBeDefined();
  expect(remoteIssue.issues.some((i: { text: string }) => i.text.includes("Zoom sync failed"))).toBe(true);

  const pendingIssue = syncIssues.find((s: { modeType: string }) => s.modeType === "Hybrid");
  expect(pendingIssue).toBeDefined();
  expect(pendingIssue.issues.some((i: { text: string }) => i.text.includes("Waiting on a Zoom host"))).toBe(true);
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

  const response = await getSyncIssues();
  const { syncIssues } = await response.json();

  expect(syncIssues.find((s: { mid: string }) => s.mid === mid)).toBeUndefined();
});

test("a meeting with a suspension scheduled for a future date shows up in the suspended panel, marked not yet active", async () => {
  const prisma = getTestPrismaClient();

  // The stored `status` field is "Suspended" (mirroring what the suspend route would set), but
  // the suspended route surfaces this meeting via getUnresolvedSuspension against today's date,
  // not this field -- since the suspension's `from` is next week, suspensionActive comes back
  // false (not yet active today), even though the meeting will show up in the panel already.
  const mid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: buildMeetingData({ mid, status: "Suspended" }),
  });
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.suspensionPeriod.create({ data: { mid, from: future, to: null } });

  const response = await getSuspended();
  const { suspendedMeetings } = await response.json();

  const row = suspendedMeetings.find((m: { mid: string }) => m.mid === mid);
  expect(row).toBeDefined();
  expect(row.suspensionActive).toBe(false);
  expect(new Date(row.suspendedSince).toISOString()).toBe(future.toISOString());
});

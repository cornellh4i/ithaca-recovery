import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn(),
}));

import { requireRole } from "../../services/auth";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { buildMeetingData as buildBaseMeetingData } from "../factories/meeting";
import { GET } from "../../app/api/admin/sync-error-mids/route";

const mockedRequireRole = requireRole as jest.Mock;

function buildMeetingData(overrides: Partial<Prisma.MeetingCreateInput> = {}) {
  return buildBaseMeetingData({
    title: "Sync Error Mids Meeting",
    modeType: "Hybrid",
    zoomRoom: "Serenity Room - Zoom",
    ...overrides,
  });
}

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedRequireRole.mockResolvedValue({ user: { role: "ADMIN" }, accessToken: "fake-token" });
});

test("rejects a non-admin request without touching the database", async () => {
  mockedRequireRole.mockResolvedValue(
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  );

  const response = await GET();
  expect(response.status).toBe(401);
});

test("returns the mids of meetings with a Google Calendar or Zoom sync error", async () => {
  const prisma = getTestPrismaClient();

  const midGoogleError = `m-${randomUUID()}`;
  const midZoomError = `m-${randomUUID()}`;
  const midSynced = `m-${randomUUID()}`;
  const midPending = `m-${randomUUID()}`;
  const midDeleted = `m-${randomUUID()}`;

  await prisma.meeting.create({
    data: buildMeetingData({ mid: midGoogleError, googleSyncStatus: "error", zoomSyncStatus: "synced" }),
  });
  await prisma.meeting.create({
    data: buildMeetingData({ mid: midZoomError, googleSyncStatus: "synced", zoomSyncStatus: "error" }),
  });
  // Neither channel in an error state -- must not show up as a false positive.
  await prisma.meeting.create({
    data: buildMeetingData({ mid: midSynced, googleSyncStatus: "synced", zoomSyncStatus: "synced" }),
  });
  // Still working through sync ("pending"/unset) -- not yet an error, must not show up either.
  await prisma.meeting.create({
    data: buildMeetingData({ mid: midPending, googleSyncStatus: "pending", zoomSyncStatus: null }),
  });
  // A genuine sync error, but soft-deleted -- must still respect the route's `deletedAt: null`
  // filter, same as every other meeting-list endpoint.
  await prisma.meeting.create({
    data: buildMeetingData({ mid: midDeleted, googleSyncStatus: "error", deletedAt: new Date() }),
  });

  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();

  expect(body.mids).toEqual(expect.arrayContaining([midGoogleError, midZoomError]));
  expect(body.mids).not.toContain(midSynced);
  expect(body.mids).not.toContain(midPending);
  expect(body.mids).not.toContain(midDeleted);
});

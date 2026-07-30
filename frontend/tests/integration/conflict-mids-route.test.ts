import { randomUUID } from "crypto";
import type { Meeting } from "@prisma/client";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn(),
}));

import { requireRole } from "../../services/auth";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { buildMeetingData as buildBaseMeetingData } from "../factories/meeting";
import { GET } from "../../app/api/admin/conflict-mids/route";

const mockedRequireRole = requireRole as jest.Mock;

function buildMeetingData(overrides: Partial<Meeting> = {}) {
  return buildBaseMeetingData({
    title: "Conflict Mids Meeting",
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

test("returns the mids of meetings sharing a busy Zoom host at overlapping times", async () => {
  const prisma = getTestPrismaClient();
  const sharedHost = `conflict-host-${randomUUID()}@icr.test`;

  const midA = `m-${randomUUID()}`;
  const midB = `m-${randomUUID()}`;
  const midUnrelated = `m-${randomUUID()}`;

  await prisma.meeting.create({
    data: buildMeetingData({ mid: midA, title: "Zoom Zoom", room: "Serenity Room", zoomHost: sharedHost }),
  });
  await prisma.meeting.create({
    data: buildMeetingData({
      mid: midB,
      title: "ABC",
      room: "Unity Room",
      zoomRoom: "Unity Room - Zoom",
      zoomHost: sharedHost,
    }),
  });
  // A third meeting with no shared resource -- must not show up as a false positive.
  // Deliberately a day apart from midA/midB's default date, same as before this
  // switched from a fixed literal to a today-relative one.
  const dayAfterStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  dayAfterStart.setUTCHours(22, 0, 0, 0);
  const dayAfterEnd = new Date(dayAfterStart.getTime() + 60 * 60 * 1000);
  await prisma.meeting.create({
    data: buildMeetingData({
      mid: midUnrelated,
      title: "Unrelated Meeting",
      room: "Room for Gratitude",
      zoomRoom: null,
      zoomHost: null,
      startDateTime: dayAfterStart,
      endDateTime: dayAfterEnd,
    }),
  });

  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();

  expect(body.mids).toEqual(expect.arrayContaining([midA, midB]));
  expect(body.mids).not.toContain(midUnrelated);
});

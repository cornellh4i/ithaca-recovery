import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn(),
}));

// The route resolves live per-host Zoom capacities; mocked so a test can make a host licensed
// (capacity 2) without a Zoom account behind it. Default: every host fails safe to capacity 1.
jest.mock("../../services/zoom", () => ({
  getZoomHostCapacities: jest.fn().mockResolvedValue({}),
}));

import { requireRole } from "../../services/auth";
import { getZoomHostCapacities } from "../../services/zoom";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { buildMeetingData as buildBaseMeetingData } from "../factories/meeting";
import { GET } from "../../app/api/admin/conflict-mids/route";

const mockedRequireRole = requireRole as jest.Mock;

function buildMeetingData(overrides: Partial<Prisma.MeetingCreateInput> = {}) {
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

  // buildMeetingData's default window is a fixed "today 18:00-19:00 ET" -- fine most of the
  // day, but the conflict horizon starts at "now" (resourceOverlap.ts's horizonRange), so a
  // test run after 7pm ET would find that default window already in the past and excluded.
  // An hour-from-now window keeps this deterministic regardless of time of day.
  const overlapStart = new Date(Date.now() + 60 * 60 * 1000);
  const overlapEnd = new Date(overlapStart.getTime() + 60 * 60 * 1000);

  await prisma.meeting.create({
    data: buildMeetingData({
      mid: midA,
      title: "Zoom Zoom",
      room: "Serenity Room",
      zoomHost: sharedHost,
      startDateTime: overlapStart,
      endDateTime: overlapEnd,
    }),
  });
  await prisma.meeting.create({
    data: buildMeetingData({
      mid: midB,
      title: "ABC",
      room: "Unity Room",
      zoomRoom: "Unity Room - Zoom",
      zoomHost: sharedHost,
      startDateTime: overlapStart,
      endDateTime: overlapEnd,
    }),
  });
  // A third meeting with no shared resource -- must not show up as a false positive.
  // Deliberately a day apart from midA/midB's overlap window.
  const dayAfterStart = new Date(overlapStart.getTime() + 24 * 60 * 60 * 1000);
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

test("a licensed host carrying two concurrent meetings produces no badge, and all three mids once a third joins", async () => {
  const prisma = getTestPrismaClient();
  const licensedHost = `licensed-conflict-host-${randomUUID()}@icr.test`;
  (getZoomHostCapacities as jest.Mock).mockResolvedValue({ [licensedHost]: 2 });

  const overlapStart = new Date(Date.now() + 60 * 60 * 1000);
  const overlapEnd = new Date(overlapStart.getTime() + 60 * 60 * 1000);
  // Distinct rooms/Zoom rooms throughout -- this is about the host bucket, and a shared room
  // would badge these meetings for a different reason entirely.
  const mids = [`m-${randomUUID()}`, `m-${randomUUID()}`, `m-${randomUUID()}`];
  const seedOnHost = (mid: string, index: number) =>
    prisma.meeting.create({
      data: buildMeetingData({
        mid,
        title: `Licensed Host Meeting ${index}`,
        room: `Capacity Badge Room ${index} ${mid}`,
        zoomRoom: `Capacity Badge Room ${index} ${mid} - Zoom`,
        zoomHost: licensedHost,
        startDateTime: overlapStart,
        endDateTime: overlapEnd,
      }),
    });

  // The route memoizes its result for 15s in module scope, so each GET here runs against a
  // clock pushed past the previous response's cache window instead of replaying it.
  const realNow = Date.now.bind(Date);
  let clockOffsetMs = 0;
  const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => realNow() + clockOffsetMs);
  const getUncached = async () => {
    clockOffsetMs += 20_000;
    return (await GET()).json();
  };

  try {
    await seedOnHost(mids[0], 0);
    await seedOnHost(mids[1], 1);

    const healthy = await getUncached();
    expect(healthy.mids).not.toContain(mids[0]);
    expect(healthy.mids).not.toContain(mids[1]);

    await seedOnHost(mids[2], 2);

    // The route unions every meeting in an over-capacity row, so all three get badged.
    const overCapacity = await getUncached();
    expect(overCapacity.mids).toEqual(expect.arrayContaining(mids));
  } finally {
    nowSpy.mockRestore();
  }
});

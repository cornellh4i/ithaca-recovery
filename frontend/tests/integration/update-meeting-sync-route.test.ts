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
  getZoomMeetingCredentials: jest.fn(),
  getZoomMeetingInvitation: jest.fn(),
  getZoomHostCapacities: jest.fn().mockResolvedValue({}),
  resolveZoomHost: jest.fn(),
  // resolveZoomHost itself is mocked (its result is controlled per-test below), but the route
  // now locks every pool host via lockResourceClaims (the real implementation, not mocked)
  // before calling it -- needs real string values to lock, not the real env-derived pool.
  zoomHostPool: ["mock-pool-host-1@icr.test", "mock-pool-host-2@icr.test"],
  zoomRoomCalendarId: {},
}));

// Spied, not stubbed: the real advisory locks still run (they are what the family-serialization
// tests below actually exercise), the mock only records which claims each transaction took.
jest.mock("../../util/meetings/resourceLocks", () => {
  const actual = jest.requireActual("../../util/meetings/resourceLocks");
  return { ...actual, lockResourceClaims: jest.fn(actual.lockResourceClaims) };
});

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { buildMeetingData as buildBaseMeetingData } from "../factories/meeting";
import { POST } from "../../app/api/update/meeting/sync/route";
import { resolveZoomHost, createZoomMeeting, updateZoomMeeting, getZoomMeetingCredentials } from "../../services/zoom";
import { reconcileMeetingCalendars } from "../../services/googleCalendar";
import { lockResourceClaims } from "../../util/meetings/resourceLocks";

const mockedLockResourceClaims = lockResourceClaims as jest.Mock;
const mockedResolveZoomHost = resolveZoomHost as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedUpdateZoomMeeting = updateZoomMeeting as jest.Mock;
const mockedGetZoomMeetingCredentials = getZoomMeetingCredentials as jest.Mock;
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
  // mockClear, not mockReset -- the spy must keep delegating to the real lock implementation.
  mockedLockResourceClaims.mockClear();
  mockedResolveZoomHost.mockReset();
  mockedCreateZoomMeeting.mockReset();
  mockedUpdateZoomMeeting.mockReset();
  mockedGetZoomMeetingCredentials.mockReset();
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
    expect.any(Array),
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

// #337: the Suspended early return must echo all four sync fields, not just the google* ones --
// MeetingSyncResult requires zoomSyncStatus/zoomSyncError too, and retryMeetingSync() casts
// response.json() straight to that type with no runtime validation.
test("a suspended meeting's sync response includes zoomSyncStatus/zoomSyncError, not just google*", async () => {
  const prisma = getTestPrismaClient();
  const meetingData = buildMeetingData({
    status: "Suspended",
    googleSyncStatus: "synced",
    googleSyncError: null,
    zoomSyncStatus: "error",
    zoomSyncError: "No Zoom host available for this meeting's schedule (pool exhausted).",
  });
  await prisma.meeting.create({ data: meetingData });

  const request = new Request("http://localhost/api/update/meeting/sync", {
    method: "POST",
    body: JSON.stringify({ mid: meetingData.mid }),
  });

  const response = await POST(request);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    googleSyncStatus: "synced",
    googleSyncError: null,
    zoomSyncStatus: "error",
    zoomSyncError: "No Zoom host available for this meeting's schedule (pool exhausted).",
  });

  // Suspended meetings skip sync entirely -- confirms this is really the early-return branch,
  // not a coincidental pass-through of the normal sync path.
  expect(mockedResolveZoomHost).not.toHaveBeenCalled();
  expect(mockedReconcileMeetingCalendars).not.toHaveBeenCalled();
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

    expect(mockedUpdateZoomMeeting).toHaveBeenCalledWith("existing-zid", expect.anything(), expect.any(Array));
    expect(mockedReconcileMeetingCalendars).toHaveBeenCalled();
  });

  test("an unmanaged Zoom meeting's retry skips the Zoom PATCH but still reconciles calendars", async () => {
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const meetingData = buildSyncedMeetingData({ zoomManaged: false });
    await prisma.meeting.create({ data: meetingData });

    const response = await POST(new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.zoomSyncStatus).toBe("synced");

    expect(mockedUpdateZoomMeeting).not.toHaveBeenCalled();
    expect(mockedReconcileMeetingCalendars).toHaveBeenCalled();
  });

  test("a shared-zid meeting's retry hands the whole family to the Zoom PATCH so the union schedule is sent (#513)", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const shared = "70000000910";
    const meetingData = buildSyncedMeetingData({ zid: shared, title: "Shared Retry A" });
    const siblingData = buildSyncedMeetingData({ zid: shared, title: "Shared Retry B" });
    await prisma.meeting.create({ data: meetingData });
    await prisma.meeting.create({ data: siblingData });

    await POST(new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    }));

    expect(mockedUpdateZoomMeeting).toHaveBeenCalledTimes(1);
    const [zidArg, , familyArg] = mockedUpdateZoomMeeting.mock.calls[0];
    expect(zidArg).toBe(shared);
    // The family the Zoom body is built from is every live row the meeting serves, the retried
    // row included -- the service replaces that row with the in-flight copy it was handed.
    expect((familyArg as { mid: string }[]).map((row) => row.mid).sort())
      .toEqual([meetingData.mid, siblingData.mid].sort());
  });

  test("a retry adopts a portal-side passcode/link change: fresh credentials are stored and the reconcile publishes the live link", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedGetZoomMeetingCredentials.mockResolvedValue({
      passcode: "rotated",
      joinUrl: "http://zoom.test/existing?pwd=rotated",
    });
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const meetingData = buildSyncedMeetingData({ zoomPasscode: "original" });
    await prisma.meeting.create({ data: meetingData });

    const response = await POST(new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    }));
    expect(response.status).toBe(200);

    expect(mockedReconcileMeetingCalendars).toHaveBeenCalledWith(
      "fake-token",
      expect.objectContaining({ zoomLink: "http://zoom.test/existing?pwd=rotated" }),
      expect.anything(),
      expect.any(Array),
    );
    const after = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
    expect(after?.zoomPasscode).toBe("rotated");
    expect(after?.zoomLink).toBe("http://zoom.test/existing?pwd=rotated");
  });

  test("adopting live credentials clears a persisted drift flag", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedGetZoomMeetingCredentials.mockResolvedValue({ passcode: "rotated", joinUrl: "http://zoom.test/existing?pwd=rotated" });
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const meetingData = buildSyncedMeetingData({ zoomPasscode: "original", zoomDriftDetectedAt: new Date() });
    await prisma.meeting.create({ data: meetingData });

    await POST(new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    }));

    const after = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
    expect(after?.zoomDriftDetectedAt).toBeNull();
  });

  test("a failed credentials fetch leaves a persisted drift flag standing", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedGetZoomMeetingCredentials.mockResolvedValue(null);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const flaggedAt = new Date();
    const meetingData = buildSyncedMeetingData({ zoomPasscode: "original", zoomDriftDetectedAt: flaggedAt });
    await prisma.meeting.create({ data: meetingData });

    await POST(new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    }));

    // Stored credentials may still be stale (the fetch failed), so the flag must survive.
    const after = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
    expect(after?.zoomDriftDetectedAt).not.toBeNull();
  });

  test("an unreachable Zoom credentials fetch keeps the stored passcode and link", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedGetZoomMeetingCredentials.mockResolvedValue(null);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const meetingData = buildSyncedMeetingData({ zoomPasscode: "original" });
    await prisma.meeting.create({ data: meetingData });

    const response = await POST(new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid: meetingData.mid }),
    }));
    expect(response.status).toBe(200);

    const after = await prisma.meeting.findUnique({ where: { mid: meetingData.mid } });
    expect(after?.zoomPasscode).toBe("original");
    expect(after?.zoomLink).toBe("http://zoom.test/existing");
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

// A linked-schedule family is served by ONE Zoom meeting and holds ONE pool host slot
// (util/meetings/linkedSchedules.ts). Retry sync provisions Zoom, so it is a place that
// invariant can be broken one row at a time.
describe("retrying a linked-schedule family", () => {
  function syncRequest(mid: string): Request {
    return new Request("http://localhost/api/update/meeting/sync", {
      method: "POST",
      body: JSON.stringify({ mid }),
    });
  }

  // Exactly the state a two-schedule create leaves behind when the host pool was exhausted:
  // both Zoom-bearing rows committed, neither provisioned.
  async function seedZidlessFamily(prefix: string) {
    const prisma = getTestPrismaClient();
    const anchor = buildMeetingData({ title: `${prefix} Anchor`, modeType: "Hybrid", room: `${prefix} Room` });
    const linked = buildMeetingData({ title: `${prefix} Linked`, linkedToMid: anchor.mid });
    await prisma.meeting.create({ data: anchor });
    await prisma.meeting.create({ data: linked });
    return { anchor, linked };
  }

  // Every zoomFamily claim taken across the request(s) a test made -- the lock that serializes
  // two retries on one family (the pool claims can't: two retries may resolve different hosts).
  type LockClaim = { type: string; value: string };
  function familyLockClaims(): LockClaim[] {
    return mockedLockResourceClaims.mock.calls
      .flatMap((call) => call[1] as LockClaim[])
      .filter((claim) => claim.type === "zoomFamily");
  }

  test("retrying both zid-less schedules of one family mints ONE Zoom meeting, shared by both", async () => {
    mockedResolveZoomHost.mockResolvedValue("family-host@icr.test");
    mockedCreateZoomMeeting.mockResolvedValue({
      zid: "one-family-zid", zoomLink: "http://zoom.test/one-family", zoomPasscode: "family-pass",
    });
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedGetZoomMeetingCredentials.mockResolvedValue(null);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const { anchor, linked } = await seedZidlessFamily("Pool Exhausted");

    expect((await POST(syncRequest(anchor.mid))).status).toBe(200);
    expect((await POST(syncRequest(linked.mid))).status).toBe(200);

    // The second retry finds the family already provisioned and PATCHes that meeting instead of
    // minting its own -- two Zoom meetings (and two host reservations) for one meeting is exactly
    // what the family exists to prevent.
    expect(mockedCreateZoomMeeting).toHaveBeenCalledTimes(1);
    expect(mockedResolveZoomHost).toHaveBeenCalledTimes(1);
    expect(mockedUpdateZoomMeeting).toHaveBeenCalledWith("one-family-zid", expect.anything(), expect.any(Array));

    const prisma = getTestPrismaClient();
    for (const mid of [anchor.mid, linked.mid]) {
      const row = await prisma.meeting.findUnique({ where: { mid } });
      expect(row?.zid).toBe("one-family-zid");
      expect(row?.zoomLink).toBe("http://zoom.test/one-family");
      expect(row?.zoomPasscode).toBe("family-pass");
      expect(row?.zoomHost).toBe("family-host@icr.test");
    }

    // Only the minting retry locks the family; the second one finds the provisioned family and
    // adopts it without ever reaching the reservation transaction. The claim names the ANCHOR's
    // mid, which is what makes the two rows' locks the same lock (see the race test below).
    expect(familyLockClaims()).toEqual([{ type: "zoomFamily", value: anchor.mid }]);
  });

  // The concurrent case #556 (1) describes, at the exact interleaving that produces it: the
  // second retry lands after the first's reservation transaction has committed (the family lock
  // it held is released there, deliberately -- the Zoom API call must not run inside a
  // transaction) but before the first's freshly-minted zid has been fanned out. Driving it from
  // inside the createZoomMeeting mock puts the second request in that window deterministically,
  // rather than hoping two Promise.all'd requests interleave there (see resourceLocks.test.ts's
  // comment on why route-level Promise.all races prove nothing here).
  test("a retry landing while a sibling's mint is still in flight defers instead of minting a second Zoom meeting", async () => {
    const { anchor, linked } = await seedZidlessFamily("Concurrent Mint");

    mockedResolveZoomHost.mockResolvedValue("race-host@icr.test");
    mockedGetZoomMeetingCredentials.mockResolvedValue(null);
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    let racingResponse: Response | null = null;
    let racingStarted = false;
    mockedCreateZoomMeeting.mockImplementation(async () => {
      // Fired once: a second retry that wrongly mints would re-enter this mock, and the point of
      // the test is to count mints, not to recurse.
      if (!racingStarted) {
        racingStarted = true;
        racingResponse = await POST(syncRequest(linked.mid));
      }
      return { zid: "race-zid", zoomLink: "http://zoom.test/race", zoomPasscode: null };
    });

    expect((await POST(syncRequest(anchor.mid))).status).toBe(200);

    // One meeting, one Zoom meeting, one host slot -- even though both rows were retried while
    // neither held a zid.
    expect(mockedCreateZoomMeeting).toHaveBeenCalledTimes(1);
    expect(mockedResolveZoomHost).toHaveBeenCalledTimes(1);

    // Both retries reached the reservation transaction and took the SAME family claim -- that is
    // what serialized them, and what let the second one see the first's reservation at all.
    expect(familyLockClaims()).toEqual([
      { type: "zoomFamily", value: anchor.mid },
      { type: "zoomFamily", value: anchor.mid },
    ]);

    const racingBody = await (racingResponse as unknown as Response).json();
    expect(racingBody.zoomSyncStatus).toBe("error");
    expect(racingBody.zoomSyncError).toMatch(/already being created/i);
    // Nothing to publish while the family's link is still unknown.
    expect(racingBody.googleSyncStatus).toBe("pending");

    const prisma = getTestPrismaClient();
    for (const mid of [anchor.mid, linked.mid]) {
      const row = await prisma.meeting.findUnique({ where: { mid } });
      expect(row?.zid).toBe("race-zid");
      expect(row?.zoomHost).toBe("race-host@icr.test");
    }

    // Retried once the mint has landed, the deferred row picks the family's Zoom meeting up
    // normally -- the defer above costs a retry, not the row's sync.
    mockedCreateZoomMeeting.mockResolvedValue(null);
    const followUp = await POST(syncRequest(linked.mid));
    expect((await followUp.json()).zoomSyncStatus).toBe("synced");
    expect(mockedCreateZoomMeeting).toHaveBeenCalledTimes(1);
  });

  test("a retry of a family that already holds a zid never mints a second Zoom meeting", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedGetZoomMeetingCredentials.mockResolvedValue(null);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const anchor = buildMeetingData({
      title: "Provisioned Anchor", modeType: "Hybrid", room: "Provisioned Room",
      zid: "provisioned-zid", zoomLink: "http://zoom.test/provisioned", zoomHost: "provisioned-host@icr.test",
      googleSyncStatus: "synced", zoomSyncStatus: "synced", zoomSyncError: null,
    });
    const linked = buildMeetingData({
      title: "Provisioned Linked", linkedToMid: anchor.mid,
      zid: "provisioned-zid", zoomLink: "http://zoom.test/provisioned", zoomHost: "provisioned-host@icr.test",
      googleSyncStatus: "synced", zoomSyncStatus: "synced", zoomSyncError: null,
    });
    await prisma.meeting.create({ data: anchor });
    await prisma.meeting.create({ data: linked });

    expect((await POST(syncRequest(anchor.mid))).status).toBe(200);
    expect((await POST(syncRequest(linked.mid))).status).toBe(200);

    expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
    expect(mockedResolveZoomHost).not.toHaveBeenCalled();
    // No reservation transaction at all: a row that already holds its family's zid never reaches
    // the mint branch.
    expect(familyLockClaims()).toEqual([]);
  });

  // #556 (3): only rows holding no Zoom identity of their own may be handed the minted one.
  test("the fan-out leaves a sibling's existing zoomLink alone", async () => {
    mockedResolveZoomHost.mockResolvedValue("fanout-guard-host@icr.test");
    mockedCreateZoomMeeting.mockResolvedValue({
      zid: "fanout-guard-zid", zoomLink: "http://zoom.test/fanout-guard", zoomPasscode: null,
    });
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const anchor = buildMeetingData({ title: "Fan Out Guard Anchor", modeType: "Hybrid", room: "Fan Out Guard Room" });
    // zid-less (so it isn't the family's holder) but already publishing an adopted link: its
    // calendar events advertise that link, and nothing here would republish them.
    const linked = buildMeetingData({
      title: "Fan Out Guard Linked", linkedToMid: anchor.mid,
      zoomLink: "http://zoom.test/adopted-legacy", googleSyncStatus: "synced",
    });
    await prisma.meeting.create({ data: anchor });
    await prisma.meeting.create({ data: linked });

    expect((await POST(syncRequest(anchor.mid))).status).toBe(200);

    const sibling = await prisma.meeting.findUnique({ where: { mid: linked.mid } });
    expect(sibling?.zoomLink).toBe("http://zoom.test/adopted-legacy");
    expect(sibling?.zid).toBeNull();
    const retried = await prisma.meeting.findUnique({ where: { mid: anchor.mid } });
    expect(retried?.zid).toBe("fanout-guard-zid");
  });

  // #556 (4): the family's one Zoom booking covers both schedules' weekdays, so the host has to
  // be free on all of them -- write/meeting/route.ts's zoomCandidate resolves the same union.
  test("the host is resolved against the family's union schedule, not the retried row's days alone", async () => {
    mockedResolveZoomHost.mockResolvedValue("union-host@icr.test");
    mockedCreateZoomMeeting.mockResolvedValue({ zid: "union-zid", zoomLink: "http://zoom.test/union", zoomPasscode: null });
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const weekly = (daysOfWeek: string[], startDate: Date | string) => ({
      create: { type: "weekly", startDate, daysOfWeek, firstDayOfWeek: "Sunday", interval: 1 },
    });
    const anchor = buildMeetingData({
      title: "Union Anchor", modeType: "Hybrid", room: "Union Room", isRecurring: true,
    });
    const linked = buildMeetingData({
      title: "Union Linked", linkedToMid: anchor.mid, isRecurring: true,
    });
    await prisma.meeting.create({
      data: { ...anchor, recurrencePattern: weekly(["Monday", "Wednesday"], anchor.startDateTime) },
    });
    await prisma.meeting.create({
      data: { ...linked, recurrencePattern: weekly(["Saturday"], linked.startDateTime) },
    });

    expect((await POST(syncRequest(anchor.mid))).status).toBe(200);

    expect(mockedResolveZoomHost).toHaveBeenCalledTimes(1);
    const [candidate] = mockedResolveZoomHost.mock.calls[0] as [{ recurrencePattern: { daysOfWeek: string[] } }];
    expect([...candidate.recurrencePattern.daysOfWeek].sort())
      .toEqual(["Monday", "Saturday", "Wednesday"]);
  });

  // #556 (5): the family's one Zoom meeting is one meeting on one account -- a row adopting it
  // has to adopt whether the app owns it, or it would PATCH a meeting the family treats as
  // unmanaged (or refuse to PATCH one it manages).
  test("adopting a sibling's Zoom meeting copies zoomManaged", async () => {
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });
    mockedGetZoomMeetingCredentials.mockResolvedValue(null);

    const prisma = getTestPrismaClient();
    const anchor = buildMeetingData({
      title: "Unmanaged Anchor", modeType: "Hybrid", room: "Unmanaged Room",
      zid: "unmanaged-zid", zoomLink: "http://zoom.test/unmanaged", zoomManaged: false,
      googleSyncStatus: "synced", zoomSyncStatus: "synced", zoomSyncError: null,
    });
    const linked = buildMeetingData({ title: "Unmanaged Linked", linkedToMid: anchor.mid });
    await prisma.meeting.create({ data: anchor });
    await prisma.meeting.create({ data: linked });

    expect((await POST(syncRequest(linked.mid))).status).toBe(200);

    const adopted = await prisma.meeting.findUnique({ where: { mid: linked.mid } });
    expect(adopted?.zid).toBe("unmanaged-zid");
    expect(adopted?.zoomManaged).toBe(false);
    // An unmanaged Zoom meeting is never PATCHed, whichever family row triggered the sync.
    expect(mockedUpdateZoomMeeting).not.toHaveBeenCalled();
  });

  test("the sibling of a just-provisioned schedule keeps its own pending sync status until it is retried", async () => {
    mockedResolveZoomHost.mockResolvedValue("family-host-2@icr.test");
    mockedCreateZoomMeeting.mockResolvedValue({
      zid: "sibling-fanout-zid", zoomLink: "http://zoom.test/sibling-fanout", zoomPasscode: null,
    });
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const { anchor, linked } = await seedZidlessFamily("Fan Out");
    expect((await POST(syncRequest(anchor.mid))).status).toBe(200);

    const prisma = getTestPrismaClient();
    const sibling = await prisma.meeting.findUnique({ where: { mid: linked.mid } });
    // Only the shared Zoom identity is fanned out: this row's own calendar events were never
    // published by the anchor's retry, so its statuses must keep saying so.
    expect(sibling?.zid).toBe("sibling-fanout-zid");
    expect(sibling?.googleSyncStatus).toBe("pending");
    expect(sibling?.zoomSyncStatus).toBe("error");
    expect(mockedReconcileMeetingCalendars).toHaveBeenCalledTimes(1);
  });

  test("retrying a zid-less schedule whose family already has a Zoom meeting adopts it instead of minting a second", async () => {
    mockedUpdateZoomMeeting.mockResolvedValue(true);
    mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null });

    const prisma = getTestPrismaClient();
    const anchor = buildMeetingData({
      title: "Adopting Anchor",
      modeType: "Hybrid",
      room: "Adopting Room",
      zid: "already-held-zid",
      zoomLink: "http://zoom.test/already-held",
      zoomPasscode: "held-pass",
      zoomInvitation: "held invitation",
      zoomHost: "held-host@icr.test",
      googleSyncStatus: "synced",
      zoomSyncStatus: "synced",
      zoomSyncError: null,
    });
    const linked = buildMeetingData({ title: "Adopting Linked", linkedToMid: anchor.mid });
    await prisma.meeting.create({ data: anchor });
    await prisma.meeting.create({ data: linked });

    const response = await POST(syncRequest(linked.mid));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.zoomSyncStatus).toBe("synced");

    expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
    // No second host slot either -- the family's booking already has one.
    expect(mockedResolveZoomHost).not.toHaveBeenCalled();
    // The shared meeting is re-PATCHed so its schedule widens to cover the adopting row's days.
    expect(mockedUpdateZoomMeeting).toHaveBeenCalledWith("already-held-zid", expect.anything(), expect.any(Array));

    const adopted = await prisma.meeting.findUnique({ where: { mid: linked.mid } });
    expect(adopted?.zid).toBe("already-held-zid");
    expect(adopted?.zoomLink).toBe("http://zoom.test/already-held");
    expect(adopted?.zoomPasscode).toBe("held-pass");
    expect(adopted?.zoomInvitation).toBe("held invitation");
    expect(adopted?.zoomHost).toBe("held-host@icr.test");

    // The holder itself is left exactly as it was.
    const holder = await prisma.meeting.findUnique({ where: { mid: anchor.mid } });
    expect(holder?.zid).toBe("already-held-zid");
    expect(holder?.googleSyncStatus).toBe("synced");
  });
});

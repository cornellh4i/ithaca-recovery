import { randomUUID } from "crypto";
import type { IMeeting } from "../../types/models";

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
  getZoomMeetingInvitation: jest.fn(),
  resolveZoomHost: jest.fn(),
  // resolveZoomHost itself is mocked (its result is controlled per-test below), but the route
  // now locks every pool host via lockResourceClaims (the real implementation, not mocked)
  // before calling it -- needs real string values to lock, not the real env-derived pool.
  zoomHostPool: ["mock-pool-host-1@icr.test", "mock-pool-host-2@icr.test"],
  zoomRoomCalendarId: {},
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedSuspensionPeriod } from "../factories/meeting";
import { PUT } from "../../app/api/update/meeting/route";
import { requireRole } from "../../services/auth";
import { updateZoomMeeting, createZoomMeeting, deleteZoomMeeting, resolveZoomHost } from "../../services/zoom";
import { reconcileMeetingCalendars, createCalendarEvent } from "../../services/googleCalendar";

const mockedRequireRole = requireRole as jest.Mock;
const mockedUpdateZoomMeeting = updateZoomMeeting as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedDeleteZoomMeeting = deleteZoomMeeting as jest.Mock;
const mockedResolveZoomHost = resolveZoomHost as jest.Mock;
const mockedReconcileMeetingCalendars = reconcileMeetingCalendars as jest.Mock;
const mockedCreateCalendarEvent = createCalendarEvent as jest.Mock;

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 2000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result != null) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

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

// Neither jest config sets clearMocks/resetMocks globally, and mockImplementation/mockResolvedValue
// set in one test otherwise leaks into later tests -- e.g. a leftover resolveZoomHost or
// reconcileMeetingCalendars call count from an earlier test would make this file's
// not.toHaveBeenCalled() assertions depend on run order instead of just the current test.
beforeEach(() => {
  mockedUpdateZoomMeeting.mockReset();
  mockedCreateZoomMeeting.mockReset();
  mockedDeleteZoomMeeting.mockReset();
  mockedResolveZoomHost.mockReset();
  mockedReconcileMeetingCalendars.mockReset();
  mockedCreateCalendarEvent.mockReset();
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
  mockedUpdateZoomMeeting.mockResolvedValue(true);
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const sharedHost = "pooled-host@icr.org";

  // Occupies the shared host at the *new* time we're about to move the edited meeting into —
  // a different room, since this is a host conflict, not a room conflict.
  const busyMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp1, ...busyMeetingData } = buildMeetingPayload({
    mid: busyMid,
    modeType: "Hybrid",
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
    modeType: "Hybrid",
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
    modeType: "Hybrid",
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

test("editing a meeting into a room that's already booked is rejected with 409 + conflicts, and never reaches the Prisma update", async () => {
  const prisma = getTestPrismaClient();
  const start = new Date("2026-09-02T18:00:00Z");
  const end = new Date("2026-09-02T19:00:00Z");

  const busyMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp1, ...busyMeetingData } = buildMeetingPayload({
    mid: busyMid, room: "Fellowship Room", startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: busyMeetingData });

  const editedMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp2, ...editedMeetingData } = buildMeetingPayload({
    mid: editedMid, room: "Serenity Room", startDateTime: start, endDateTime: end,
  });
  const original = await prisma.meeting.create({ data: editedMeetingData });

  const payload = buildMeetingPayload({
    mid: editedMid, room: "Fellowship Room", startDateTime: start, endDateTime: end,
  });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.conflicts).toHaveLength(1);
  expect(body.conflicts[0]).toMatchObject({ field: "room", value: "Fellowship Room" });
  expect(body.conflicts[0].meetings.map((m: { mid: string }) => m.mid)).toContain(busyMid);

  // The room edit never landed -- still the pre-update value.
  const unchanged = await prisma.meeting.findUnique({ where: { mid: editedMid } });
  expect(unchanged?.room).toBe(original.room);
});

test("confirmOverride: true bypasses the room conflict check and saves the edit anyway", async () => {
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const start = new Date("2026-09-03T18:00:00Z");
  const end = new Date("2026-09-03T19:00:00Z");

  const busyMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp1, ...busyMeetingData } = buildMeetingPayload({
    mid: busyMid, room: "Fellowship Room", startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: busyMeetingData });

  const editedMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp2, ...editedMeetingData } = buildMeetingPayload({
    mid: editedMid, room: "Serenity Room", startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: editedMeetingData });

  const payload = {
    ...buildMeetingPayload({ mid: editedMid, room: "Fellowship Room", startDateTime: start, endDateTime: end }),
    confirmOverride: true,
  };
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  // Waits for (and asserts) the deferred sync job's terminal status, rather than a fixed delay
  // that could pass without proving the background reconcileMeetingCalendars call completed.
  const updated = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid: editedMid } });
    return row?.googleSyncStatus != null ? row : null;
  });

  expect(updated?.googleSyncStatus).toBe("synced");
  expect(updated?.room).toBe("Fellowship Room");
});

test("a newly resolved Zoom host is persisted synchronously when a meeting first gets a Zoom room", async () => {
  mockedResolveZoomHost.mockResolvedValue("new-host@icr.test");
  const SYNC_DELAY_MS = 300;
  mockedCreateZoomMeeting.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve({ zid: "new-zid", zoomLink: "http://zoom.test/new" }), SYNC_DELAY_MS)),
  );
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const mid = `m-${randomUUID()}`;
  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite that also create real rows at its default date, and the room conflict check
  // would otherwise make this order-dependent on unrelated leftover data.
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({ mid, modeType: "Hybrid", room: "Zoom Assign Room", zoomRoom: "" });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = buildMeetingPayload({ mid, modeType: "Hybrid", room: "Zoom Assign Room", zoomRoom: "Zoom Assign Room - Zoom" });
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
  mockedResolveZoomHost.mockResolvedValue(null);
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const mid = `m-${randomUUID()}`;
  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite that also create real rows at its default date, and the room conflict check
  // would otherwise make this order-dependent on unrelated leftover data.
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({ mid, modeType: "Hybrid", room: "Update Pool Exhaustion Room", zoomRoom: "" });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = buildMeetingPayload({ mid, modeType: "Hybrid", room: "Update Pool Exhaustion Room", zoomRoom: "Update Pool Exhaustion Room - Zoom" });
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

  // Direct regression test for Matt's confirmation, on the update path: a meeting that needs
  // Zoom but has no working Zoom meeting after this run must not have its calendars reconciled
  // with a missing link -- googleSyncStatus is 'pending', reconcileMeetingCalendars never ran.
  const afterSync = await prisma.meeting.findUnique({ where: { mid } });
  expect(afterSync?.googleSyncStatus).toBe("pending");
  expect(mockedReconcileMeetingCalendars).not.toHaveBeenCalled();
});

test("an explicit host reassignment tears down the old Zoom meeting and creates a new one under the new host", async () => {
  mockedDeleteZoomMeeting.mockResolvedValue(true);
  mockedCreateZoomMeeting.mockResolvedValue({ zid: "zid-reassigned", zoomLink: "http://zoom.test/reassigned", zoomPasscode: null });
  mockedCreateCalendarEvent.mockResolvedValue({ id: "fake-zoom-cal-event-id", error: null });
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: {}, allSynced: true });

  const prisma = getTestPrismaClient();
  const mid = `m-${randomUUID()}`;
  // Explicit, distinct time slot -- buildMeetingPayload's default is shared by other tests in
  // this file, some of which persist a meeting on "new-host@icr.test" and never clean it up;
  // reusing the default here would make this test's new (real, since findResourceConflicts is
  // no longer bypassed for a manual host) conflict check order-dependent on those leftovers.
  const start = new Date("2026-10-01T15:00:00Z");
  const end = new Date("2026-10-01T16:00:00Z");
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({
    mid,
    modeType: "Hybrid",
    zoomRoom: "Serenity Room - Zoom",
    zid: "zid-original",
    zoomHost: "old-host@icr.test",
    zoomCalendarEventId: "old-zoom-cal-event-id",
    startDateTime: start,
    endDateTime: end,
  });
  await prisma.meeting.create({ data: existingMeetingData });

  // Same room, same time -- only the manually-selected host changes.
  const payload = buildMeetingPayload({
    mid,
    modeType: "Hybrid",
    zoomRoom: "Serenity Room - Zoom",
    zid: "zid-original",
    zoomHost: "new-host@icr.test",
    startDateTime: start,
    endDateTime: end,
  });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(mockedDeleteZoomMeeting).toHaveBeenCalledWith("zid-original");
  expect(mockedUpdateZoomMeeting).not.toHaveBeenCalled();

  const afterSync = await prisma.meeting.findUnique({ where: { mid } });
  expect(afterSync?.zid).toBe("zid-reassigned");
  expect(afterSync?.zoomHost).toBe("new-host@icr.test");
  expect(afterSync?.zoomSyncStatus).toBe("synced");
});

test("an explicit host reassignment to an already-busy host is rejected with 409, and never reaches the Prisma update", async () => {
  const prisma = getTestPrismaClient();
  // Explicit, distinct time slot -- see the comment on the reassignment test above for why.
  const start = new Date("2026-10-02T15:00:00Z");
  const end = new Date("2026-10-02T16:00:00Z");
  const busyHost = "busy-reassign-host@icr.test";

  const busyMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rpBusy, ...busyMeetingData } = buildMeetingPayload({
    mid: busyMid, modeType: "Hybrid", room: "Fellowship Room", zoomRoom: "Fellowship Room - Zoom",
    zid: "zid-busy", zoomHost: busyHost, startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: busyMeetingData });

  const mid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({
    mid, modeType: "Hybrid", room: "Serenity Room", zoomRoom: "Serenity Room - Zoom",
    zid: "zid-original", zoomHost: "old-host-2@icr.test", startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = buildMeetingPayload({
    mid, modeType: "Hybrid", room: "Serenity Room", zoomRoom: "Serenity Room - Zoom",
    zid: "zid-original", zoomHost: busyHost, startDateTime: start, endDateTime: end,
  });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.conflicts).toHaveLength(1);
  expect(body.conflicts[0]).toMatchObject({ field: "zoomHost", value: busyHost });
  expect(body.conflicts[0].meetings.map((m: { mid: string }) => m.mid)).toContain(busyMid);

  // The reassignment never landed -- still the pre-update host, Zoom meeting untouched.
  const unchanged = await prisma.meeting.findUnique({ where: { mid } });
  expect(unchanged?.zoomHost).toBe("old-host-2@icr.test");
  expect(unchanged?.zid).toBe("zid-original");
  expect(mockedDeleteZoomMeeting).not.toHaveBeenCalled();
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
});

test("needsNewHost triggered by a missing zid (not an explicit host change) still re-checks and detects a real zoomHost conflict", async () => {
  const prisma = getTestPrismaClient();
  const start = new Date("2026-10-03T15:00:00Z");
  const end = new Date("2026-10-03T16:00:00Z");
  const sharedHost = "no-zid-recheck-host@icr.test";

  const busyMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rpBusy, ...busyMeetingData } = buildMeetingPayload({
    mid: busyMid, modeType: "Hybrid", room: "Fellowship Room", zoomRoom: "Fellowship Room - Zoom",
    zid: "zid-busy-3", zoomHost: sharedHost, startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: busyMeetingData });

  // The meeting being edited already carries `sharedHost` (persisted from a prior write) but
  // has no live zid -- e.g. the Zoom API call itself previously failed after the host was
  // resolved and committed. needsNewHost is driven purely by `!existingMeeting.zid` here; the
  // payload resubmits the *same* zoomHost value unchanged, so explicitHostChange is false and
  // the blocking check's zoomHost bucket (gated on explicitHostChange) never examines it -- only
  // the resolution block's own re-check can catch this conflict.
  const mid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({
    mid, modeType: "Hybrid", room: "Serenity Room", zoomRoom: "Serenity Room - Zoom",
    zid: null, zoomHost: sharedHost, startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = buildMeetingPayload({
    mid, modeType: "Hybrid", room: "Serenity Room", zoomRoom: "Serenity Room - Zoom",
    zid: null, zoomHost: sharedHost, startDateTime: start, endDateTime: end,
  });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  // Not a blocking conflict -- explicitHostChange is false, so this gets the same fail-soft/
  // defer treatment as pool exhaustion, not a 409.
  expect(response.status).toBe(200);
  const updated = await response.json();
  expect(updated.zoomHost).toBeNull();
  expect(updated.zoomSyncError).toMatch(/conflicts with another meeting/i);
  expect(updated.attemptedZoomHost).toBe(sharedHost);
  expect(mockedResolveZoomHost).not.toHaveBeenCalled();
});

test("confirmOverride: true bypasses the zoomHost reassignment block, tears down the old Zoom meeting, but still defers the new one (Zoom itself can't double-book a host)", async () => {
  mockedDeleteZoomMeeting.mockResolvedValue(true);

  const prisma = getTestPrismaClient();
  const start = new Date("2026-10-02T17:00:00Z");
  const end = new Date("2026-10-02T18:00:00Z");
  const busyHost = "busy-reassign-host-2@icr.test";

  const busyMid = `m-${randomUUID()}`;
  const { recurrencePattern: _rpBusy, ...busyMeetingData } = buildMeetingPayload({
    mid: busyMid, modeType: "Hybrid", room: "Fellowship Room", zoomRoom: "Fellowship Room - Zoom",
    zid: "zid-busy-2", zoomHost: busyHost, startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: busyMeetingData });

  const mid = `m-${randomUUID()}`;
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({
    mid, modeType: "Hybrid", room: "Serenity Room", zoomRoom: "Serenity Room - Zoom",
    zid: "zid-original-2", zoomHost: "old-host-3@icr.test", startDateTime: start, endDateTime: end,
  });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = {
    ...buildMeetingPayload({
      mid, modeType: "Hybrid", room: "Serenity Room", zoomRoom: "Serenity Room - Zoom",
      zid: "zid-original-2", zoomHost: busyHost, startDateTime: start, endDateTime: end,
    }),
    confirmOverride: true,
  };
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  const afterSync = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid } });
    return row?.zid === null && row?.zoomSyncStatus === "error" ? row : null;
  });

  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();

  expect(afterSync?.zid).toBeNull();
  expect(afterSync?.zoomHost).toBeNull();
  expect(afterSync?.zoomSyncStatus).toBe("error");
  expect(afterSync?.zoomSyncError).toMatch(/conflicts with another meeting/i);
  // Regression coverage: the losing host pick must still be recorded so the Diagnostics
  // Conflicts panel can bucket this meeting against busyHost's holder (see computeConflicts'
  // attemptedZoomHost fallback in util/resourceOverlap.ts) — previously this was discarded
  // entirely, leaving a real conflict invisible in that panel.
  expect(afterSync?.attemptedZoomHost).toBe(busyHost);
});

test("editing a meeting whose scheduled resume date has already passed promotes the pre-created resume series first", async () => {
  mockedReconcileMeetingCalendars.mockResolvedValue({ updatedEventIds: { AA: "still-stale-id" }, allSynced: true });

  const prisma = getTestPrismaClient();
  const mid = `m-${randomUUID()}`;
  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite that also create real rows at its default date, and the room conflict check
  // would otherwise make this order-dependent on unrelated leftover data.
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({
    mid,
    room: "Resume Promotion Room",
    googleCalendarEventIds: { AA: "stale-pre-suspend-event-id" },
  });
  await prisma.meeting.create({ data: existingMeetingData });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await seedSuspensionPeriod(mid, {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: yesterday,
    resumeEventIds: { AA: "resume-event-id" },
    promoted: false,
  });

  const payload = buildMeetingPayload({ mid, room: "Resume Promotion Room", title: "Edited Title" });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  // reconcileMeetingCalendars must have been called against the promoted pointer
  // (resume-event-id), not the stale pre-suspend one still sitting in the DB row.
  expect(mockedReconcileMeetingCalendars).toHaveBeenCalledWith(
    "fake-token",
    expect.anything(),
    { AA: "resume-event-id" },
  );

  const suspension = await prisma.suspensionPeriod.findFirst({ where: { mid } });
  expect(suspension?.promoted).toBe(true);
});

test("a missing access token persists an error status instead of leaving googleSyncStatus unset", async () => {
  mockedRequireRole.mockResolvedValueOnce({ user: { role: "ADMIN" }, accessToken: undefined });

  const prisma = getTestPrismaClient();
  const mid = `m-${randomUUID()}`;
  // Distinct room, and distinct from write-meeting-route.test.ts's own "no access token" test
  // -- both files run against the same shared test-DB instance within one test run, and this
  // test doesn't override the default startDateTime/endDateTime, so a same-named room here would
  // collide with that other file's meeting at the same default time window and fail this PUT
  // with an unrelated 409, not the googleSyncStatus assertion this test actually checks.
  const { recurrencePattern: _rp, ...existingMeetingData } = buildMeetingPayload({ mid, room: "Update Route No Access Token Room" });
  await prisma.meeting.create({ data: existingMeetingData });

  const payload = buildMeetingPayload({ mid, room: "Update Route No Access Token Room", title: "Edited Title" });
  const request = new Request("http://localhost/api/update/meeting", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  const response = await PUT(request);
  expect(response.status).toBe(200);

  const afterSync = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid } });
    return row?.googleSyncStatus != null ? row : null;
  });

  expect(afterSync?.googleSyncStatus).toBe("error");
  expect(afterSync?.googleSyncError).toBeTruthy();
  expect(mockedReconcileMeetingCalendars).not.toHaveBeenCalled();
});

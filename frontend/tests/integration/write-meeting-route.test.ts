import { randomUUID } from "crypto";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedSuspensionPeriod } from "../factories/meeting";
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
  calendarIdsForMeeting: jest.fn().mockReturnValue({ AA: "fake-calendar-id" }),
  createCalendarEvent: jest.fn(),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  getZoomMeetingInvitation: jest.fn(),
  resolveZoomHost: jest.fn(),
  // resolveZoomHost itself is mocked (its result is controlled per-test below), but the route
  // now locks every pool host via lockResourceClaims (the real implementation, not mocked)
  // before calling it -- needs real string values to lock, not the real env-derived pool.
  zoomHostPool: ["mock-pool-host-1@icr.test", "mock-pool-host-2@icr.test"],
  zoomRoomCalendarId: {},
}));

import { requireRole } from "../../services/auth";
import { createCalendarEvent } from "../../services/googleCalendar";
import { resolveZoomHost, createZoomMeeting } from "../../services/zoom";
import { POST } from "../../app/api/write/meeting/route";

const mockedRequireRole = requireRole as jest.Mock;
const mockedCreateCalendarEvent = createCalendarEvent as jest.Mock;
const mockedResolveZoomHost = resolveZoomHost as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;

// Polls for the deferred sync job's persisted terminal googleSyncStatus instead of guessing a
// fixed delay -- race-prone under slower CI/database conditions, per CodeRabbit's review
// of this file. Only safe to use for a meeting whose deferred job writes googleSyncStatus as its
// last step (e.g. a non-Zoom-enabled meeting, where the calendar-sync update is the only
// write left after the response returns).
async function waitForGoogleSyncStatus(mid: string, timeoutMs = 2000) {
  const prisma = getTestPrismaClient();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const meeting = await prisma.meeting.findUnique({ where: { mid } });
    if (meeting?.googleSyncStatus != null) return meeting;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return prisma.meeting.findUnique({ where: { mid } });
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

// Neither jest config sets clearMocks/resetMocks globally, and mockImplementation set in one
// test (e.g. the 300ms-delayed createCalendarEvent below) otherwise leaks into later tests —
// which previously made the Zoom-pool-exhaustion test below flaky, since the leftover GCal
// delay pushed syncNewMeeting's background work past that test's own wait window.
beforeEach(() => {
  mockedCreateCalendarEvent.mockReset();
  mockedResolveZoomHost.mockReset();
  mockedCreateZoomMeeting.mockReset();
});

test("the response resolves before Google Calendar sync completes, which runs in the background", async () => {
  const SYNC_DELAY_MS = 300;
  mockedCreateCalendarEvent.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve({ id: "fake-event-id", error: null }), SYNC_DELAY_MS)),
  );

  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite; the room conflict check would otherwise make this order-dependent on
  // whichever test happens to run first (see the "Distinct room" comment further down).
  const payload = buildMeetingPayload({ room: "Sync Timing Room" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const start = Date.now();
  const response = await POST(request);
  const elapsed = Date.now() - start;

  expect(response.status).toBe(201);
  expect(elapsed).toBeLessThan(SYNC_DELAY_MS);

  const prisma = getTestPrismaClient();
  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(rightAfterResponse?.googleSyncStatus).toBeNull();

  // waitUntil has no real lifecycle hook outside Vercel, but the background
  // function still runs to completion on its own — just give it time to finish.
  await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS + 100));
  const afterSync = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(afterSync?.googleSyncStatus).toBe("synced");
});

test("a resolved Zoom host is persisted synchronously, before the deferred sync runs", async () => {
  mockedResolveZoomHost.mockResolvedValue("host@icr.test");
  const SYNC_DELAY_MS = 300;
  mockedCreateCalendarEvent.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve({ id: "fake-event-id", error: null }), SYNC_DELAY_MS)),
  );

  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite (see the "Distinct room" comment further down).
  const payload = buildMeetingPayload({ modeType: "Hybrid", room: "Zoom Host Timing Room", zoomRoom: "Zoom Host Timing Room - Zoom" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  // The host must already be committed to the DB row by the time the response comes back —
  // that's the whole point of resolving it before the initial create rather than inside the
  // deferred after() job, which here is still 300ms away from even starting its Zoom work.
  const prisma = getTestPrismaClient();
  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(rightAfterResponse?.zoomHost).toBe("host@icr.test");

  await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS + 100));
});

test("a malformed body returns 400 with validation issues instead of a raw 500", async () => {
  const malformed = buildMeetingPayload({ email: "not-an-email" });
  // @ts-expect-error - deliberately wrong type to trigger schema validation, not a DB error
  malformed.calType = "AA";

  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(malformed),
  });

  const response = await POST(request);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toBe("Invalid meeting data");
  expect(Array.isArray(body.issues)).toBe(true);
  expect(body.issues.length).toBeGreaterThan(0);

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: malformed.mid } });
  expect(created).toBeNull();
});

test("an exhausted Zoom host pool fails soft: the meeting is still created", async () => {
  mockedResolveZoomHost.mockResolvedValue(null);

  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite (see the "Distinct room" comment further down).
  const payload = buildMeetingPayload({ modeType: "Hybrid", room: "Pool Exhaustion Room", zoomRoom: "Pool Exhaustion Room - Zoom" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  // Pool exhaustion is detected synchronously (resolveZoomHost runs before the initial
  // create), so the error status is already on the row before the deferred sync ever runs.
  const prisma = getTestPrismaClient();
  const rightAfterResponse = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(rightAfterResponse?.zoomHost).toBeNull();
  expect(rightAfterResponse?.zoomSyncStatus).toBe("error");
  expect(rightAfterResponse?.zoomSyncError).toMatch(/pool exhausted/i);

  // waitUntil has no real lifecycle hook outside Vercel, but the background
  // function still runs to completion on its own — just give it time to finish.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const afterSync = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(afterSync?.zid).toBeNull();
  expect(afterSync?.zoomHost).toBeNull();
  expect(afterSync?.zoomSyncStatus).toBe("error");
  expect(afterSync?.zoomSyncError).toMatch(/pool exhausted/i);

  // The direct regression test for Matt's confirmation: a meeting that needs Zoom but has no
  // working Zoom meeting yet must NOT be published to the calendars with a missing link —
  // googleSyncStatus is 'pending', not 'synced'/'error', and the calendar-publish loop never ran.
  expect(afterSync?.googleSyncStatus).toBe("pending");
  expect(afterSync?.googleCalendarEventIds).toBeNull();
  expect(mockedCreateCalendarEvent).not.toHaveBeenCalled();
});

test("a manually-selected host that conflicts with another meeting is rejected with 409, and never reaches the Prisma create", async () => {
  const prisma = getTestPrismaClient();
  // Explicit, distinct time slot -- buildMeetingPayload's default is shared by other tests in
  // this file/suite, so reusing it here could make this conflict check order-dependent on
  // unrelated leftover data.
  const start = new Date("2026-11-01T18:00:00Z");
  const end = new Date("2026-11-01T19:00:00Z");
  const conflictHost = "conflict-host@icr.test";

  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Busy Meeting", modeType: "Hybrid", description: "", creator: "Creator", group: "Group",
      startDateTime: start, endDateTime: end, email: "busy@test.icr", zoomRoom: "Serenity Room - Zoom",
      calType: ["AA"], status: "Active", room: "Serenity Room", isRecurring: false,
      zid: "zid-busy", zoomHost: conflictHost,
    },
  });

  const payload = buildMeetingPayload({
    modeType: "Hybrid", room: "Fellowship Room", zoomRoom: "Fellowship Room - Zoom",
    zoomHost: conflictHost, startDateTime: start, endDateTime: end,
  });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.conflicts).toHaveLength(1);
  expect(body.conflicts[0]).toMatchObject({ field: "zoomHost", value: conflictHost });
  expect(body.conflicts[0].meetings.map((m: { mid: string }) => m.mid)).toContain(busyMid);

  const created = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(created).toBeNull();
  expect(mockedResolveZoomHost).not.toHaveBeenCalled();
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
  expect(mockedCreateCalendarEvent).not.toHaveBeenCalled();
});

test("confirmOverride: true bypasses the zoomHost conflict block, creates the meeting, but still defers its Zoom sync (Zoom itself can't double-book a host)", async () => {
  const prisma = getTestPrismaClient();
  const start = new Date("2026-11-01T20:00:00Z");
  const end = new Date("2026-11-01T21:00:00Z");
  const conflictHost = "conflict-host-2@icr.test";

  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Busy Meeting 2", modeType: "Hybrid", description: "", creator: "Creator", group: "Group",
      startDateTime: start, endDateTime: end, email: "busy@test.icr", zoomRoom: "Serenity Room - Zoom",
      calType: ["AA"], status: "Active", room: "Serenity Room", isRecurring: false,
      zid: "zid-busy-2", zoomHost: conflictHost,
    },
  });

  const payload = {
    ...buildMeetingPayload({
      modeType: "Hybrid", room: "Fellowship Room", zoomRoom: "Fellowship Room - Zoom",
      zoomHost: conflictHost, startDateTime: start, endDateTime: end,
    }),
    confirmOverride: true,
  };
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);
  const created = await response.json();

  // The meeting itself saves (the admin's explicit override), but the conflict still genuinely
  // exists at the Zoom-API level, so the host isn't committed and the Zoom sync is deferred with
  // a specific error, not the generic "pool exhausted" one.
  expect(created.zoomHost).toBeNull();
  expect(created.zoomSyncError).toMatch(/conflicts with another meeting/i);
  // Regression coverage: the losing host pick must still be recorded so the Diagnostics
  // Conflicts panel can bucket this meeting against conflictHost's holder (see
  // computeConflicts' attemptedZoomHost fallback in util/resourceOverlap.ts) — previously this
  // was discarded entirely, leaving a real conflict invisible in that panel.
  expect(created.attemptedZoomHost).toBe(conflictHost);

  const afterSync = await waitForGoogleSyncStatus(created.mid);
  expect(afterSync?.googleSyncStatus).toBe("pending");
  expect(afterSync?.zoomSyncError).toMatch(/conflicts with another meeting/i);
  expect(mockedResolveZoomHost).not.toHaveBeenCalled();
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
  expect(mockedCreateCalendarEvent).not.toHaveBeenCalled();
});

test("confirmOverride: true on a count-bounded recurring series checks zoomHost against its real end date, not the full horizon", async () => {
  const prisma = getTestPrismaClient();
  const host = "count-bounded-host@icr.test";

  // 5 consecutive days starting Nov 1 2026 (daysOfWeek: ALL_DAYS + no explicit endDate, only
  // numberOfOccurrences) -- real last occurrence is Nov 5 2026. A naive check against the raw
  // (still-null) endDate would instead expand this out to the full 2-year OVERLAP_HORIZON_YEARS
  // window and wrongly catch the Feb 2027 meeting below as a conflict.
  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Far-future host holder", modeType: "Hybrid", description: "", creator: "Creator", group: "Group",
      startDateTime: new Date("2027-02-01T20:00:00Z"), endDateTime: new Date("2027-02-01T21:00:00Z"),
      email: "busy@test.icr", zoomRoom: "Unity Room - Zoom",
      calType: ["AA"], status: "Active", room: "Unity Room", isRecurring: false,
      zid: "zid-far-future", zoomHost: host,
    },
  });

  const payload = {
    ...buildMeetingPayload({
      modeType: "Hybrid", room: "Fellowship Room", zoomRoom: "Fellowship Room - Zoom", zoomHost: host,
      startDateTime: new Date("2026-11-01T20:00:00Z"), endDateTime: new Date("2026-11-01T21:00:00Z"),
      isRecurring: true,
      recurrencePattern: {
        type: "weekly",
        startDate: new Date("2026-11-01T00:00:00Z"),
        firstDayOfWeek: "Sunday",
        interval: 1,
        daysOfWeek: ALL_DAYS,
        numberOfOccurrences: 5,
      },
    }),
    confirmOverride: true,
  };
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);
  const created = await response.json();

  // No real conflict -- the series ends Nov 5 2026, well before the Feb 2027 meeting -- so the
  // manually-picked host should be committed cleanly, not deferred with a false conflict error.
  expect(created.zoomHost).toBe(host);
  expect(created.zoomSyncError).toBeFalsy();
  expect(created.attemptedZoomHost).toBeNull();
});

test("a Remote meeting (no zoomRoom) still gets a Zoom meeting created, and its main calendar event carries the real zoomLink", async () => {
  mockedResolveZoomHost.mockResolvedValue("host@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: "remote-zid", zoomLink: "http://zoom.test/remote", zoomPasscode: null });
  mockedCreateCalendarEvent.mockResolvedValue({ id: "fake-event-id", error: null });

  const payload = buildMeetingPayload({ modeType: "Remote", room: "", zoomRoom: "" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  const afterSync = await waitForGoogleSyncStatus(payload.mid);
  expect(afterSync?.zid).toBe("remote-zid");
  expect(afterSync?.zoomLink).toBe("http://zoom.test/remote");
  expect(afterSync?.googleSyncStatus).toBe("synced");

  // Remote has no dedicated Zoom-Room calendar (no zoomRoom) -- the main calType-calendar
  // event is the only place its Zoom link can appear, so it must carry the real link, not
  // a null one left over from before Zoom resolved.
  expect(mockedCreateCalendarEvent).toHaveBeenCalledWith(
    "fake-token",
    expect.objectContaining({ zoomLink: "http://zoom.test/remote" }),
    "fake-calendar-id",
  );
});

test("a room conflict is rejected with 409 + conflicts, and never reaches the Prisma create", async () => {
  const prisma = getTestPrismaClient();
  const start = new Date("2026-11-02T18:00:00Z");
  const end = new Date("2026-11-02T19:00:00Z");

  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Room Conflict Meeting", modeType: "In Person", description: "", creator: "Creator", group: "Group",
      startDateTime: start, endDateTime: end, email: "busy@test.icr",
      calType: ["AA"], status: "Active", room: "Fellowship Room", isRecurring: false,
    },
  });

  const payload = buildMeetingPayload({ room: "Fellowship Room", startDateTime: start, endDateTime: end });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.conflicts).toHaveLength(1);
  expect(body.conflicts[0]).toMatchObject({ field: "room", value: "Fellowship Room" });
  expect(body.conflicts[0].meetings.map((m: { mid: string }) => m.mid)).toContain(busyMid);

  const created = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(created).toBeNull();
});

// Regression test for a bug where findResourceConflictRows/findResourceConflicts anchored their
// overlap window's lower bound to `new Date()` ("now") -- a candidate or existing meeting whose
// occurrence had already ended relative to the current instant expanded to zero occurrences, so
// the conflict silently went undetected as soon as the clock passed the meeting's own end time.
// Yesterday (not "today", which would only reproduce this after whatever time of day the suite
// happens to run) keeps this deterministic regardless of wall-clock time, while staying well
// within candidateHorizonRange's own bound so the test doesn't itself go stale years from now.
test("a room conflict against an already-elapsed (past) time slot is still rejected with 409", async () => {
  const prisma = getTestPrismaClient();
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  const start = new Date(`${dateStr}T18:00:00Z`);
  const end = new Date(`${dateStr}T19:00:00Z`);

  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Past Room Conflict Meeting", modeType: "In Person", description: "", creator: "Creator", group: "Group",
      startDateTime: start, endDateTime: end, email: "busy@test.icr",
      calType: ["AA"], status: "Active", room: "Fellowship Room", isRecurring: false,
    },
  });

  const payload = buildMeetingPayload({ room: "Fellowship Room", startDateTime: start, endDateTime: end });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.conflicts[0].meetings.map((m: { mid: string }) => m.mid)).toContain(busyMid);

  const created = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(created).toBeNull();
});

test("confirmOverride: true bypasses the room conflict check and creates the meeting anyway", async () => {
  mockedCreateCalendarEvent.mockResolvedValue({ id: "fake-event-id", error: null });

  const prisma = getTestPrismaClient();
  const start = new Date("2026-11-03T18:00:00Z");
  const end = new Date("2026-11-03T19:00:00Z");

  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Room Conflict Meeting", modeType: "In Person", description: "", creator: "Creator", group: "Group",
      startDateTime: start, endDateTime: end, email: "busy@test.icr",
      calType: ["AA"], status: "Active", room: "Fellowship Room", isRecurring: false,
    },
  });

  const payload = { ...buildMeetingPayload({ room: "Fellowship Room", startDateTime: start, endDateTime: end }), confirmOverride: true };
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  const created = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(created).not.toBeNull();

  // Waits for (and asserts) the deferred sync job's terminal status, rather than a fixed delay
  // that could pass without proving the background work actually completed.
  const afterSync = await waitForGoogleSyncStatus(payload.mid);
  expect(afterSync?.googleSyncStatus).toBe("synced");
});

// The daysOfWeek below covers all 7 days so the pattern produces an occurrence every day --
// avoids day-of-week alignment fragility for these date-math-sensitive suspension cases.
const ALL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const daysFromNow = (n: number, time: string) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return new Date(`${d.toISOString().slice(0, 10)}T${time}Z`);
};

test("a recurring meeting that's suspended today but resumes before the candidate's occurrence still conflicts", async () => {
  const prisma = getTestPrismaClient();
  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Suspended-Then-Resumed Meeting", modeType: "In Person", description: "", creator: "Creator", group: "Group",
      startDateTime: daysFromNow(0, "18:00:00"), endDateTime: daysFromNow(0, "19:00:00"), email: "busy@test.icr",
      calType: ["AA"], status: "Active", room: "Fellowship Room", isRecurring: true,
    },
  });
  await prisma.recurrencePattern.create({
    data: { mid: busyMid, type: "weekly", startDate: daysFromNow(0, "18:00:00"), daysOfWeek: ALL_DAYS, firstDayOfWeek: "Sunday", interval: 1 },
  });
  // Suspended from yesterday, resumes in 5 days -- well before the candidate's occurrence 10
  // days out, so that specific future occurrence is not actually suspended.
  await seedSuspensionPeriod(busyMid, { from: daysFromNow(-1, "00:00:00"), to: daysFromNow(5, "00:00:00") });

  const payload = buildMeetingPayload({ room: "Fellowship Room", startDateTime: daysFromNow(10, "18:00:00"), endDateTime: daysFromNow(10, "19:00:00") });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.conflicts[0].meetings.map((m: { mid: string }) => m.mid)).toContain(busyMid);
});

test("a recurring meeting with a future suspension window doesn't conflict with a booking inside it", async () => {
  mockedCreateCalendarEvent.mockResolvedValue({ id: "fake-event-id", error: null });

  const prisma = getTestPrismaClient();
  const busyMid = `m-${randomUUID()}`;
  await prisma.meeting.create({
    data: {
      mid: busyMid, title: "Soon-To-Be-Suspended Meeting", modeType: "In Person", description: "", creator: "Creator", group: "Group",
      startDateTime: daysFromNow(0, "18:00:00"), endDateTime: daysFromNow(0, "19:00:00"), email: "busy@test.icr",
      calType: ["AA"], status: "Active", room: "Fellowship Room 2", isRecurring: true,
    },
  });
  await prisma.recurrencePattern.create({
    data: { mid: busyMid, type: "weekly", startDate: daysFromNow(0, "18:00:00"), daysOfWeek: ALL_DAYS, firstDayOfWeek: "Sunday", interval: 1 },
  });
  // Not suspended today, but will be starting in 5 days, indefinitely -- covers the candidate's
  // occurrence 10 days out.
  await seedSuspensionPeriod(busyMid, { from: daysFromNow(5, "00:00:00"), to: null });

  const payload = buildMeetingPayload({ room: "Fellowship Room 2", startDateTime: daysFromNow(10, "18:00:00"), endDateTime: daysFromNow(10, "19:00:00") });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  // Let the deferred sync job (which the mock above resolves) finish before the test exits, so
  // it can't leak an in-flight createCalendarEvent call into a later test.
  await waitForGoogleSyncStatus(payload.mid);
});

test("a recurring meeting creates its Meeting and RecurrencePattern together (one transaction, not two sequential writes)", async () => {
  mockedCreateCalendarEvent.mockResolvedValue({ id: "fake-event-id", error: null });

  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite, and the room/zoomRoom conflict check added alongside this transaction fix
  // would otherwise make this order-dependent on unrelated leftover data (same reasoning as the
  // manually-selected-host test above).
  const payload = buildMeetingPayload({
    room: "Fellowship Room 3",
    isRecurring: true,
    recurrencePattern: {
      type: "weekly",
      startDate: new Date("2026-08-03T00:00:00Z"),
      firstDayOfWeek: "Sunday",
      interval: 1,
      daysOfWeek: ["Monday"],
    },
  });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);
  const created = await response.json();

  // The route's response is now built from the transaction's own results, not a
  // post-transaction refetch -- assert the recurrencePattern is already inline.
  expect(created.recurrencePattern).toMatchObject({ mid: payload.mid, type: "weekly" });

  const prisma = getTestPrismaClient();
  const meetingRow = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  const patternRow = await prisma.recurrencePattern.findUnique({ where: { mid: payload.mid } });
  expect(meetingRow?.isRecurring).toBe(true);
  expect(patternRow).not.toBeNull();
  expect(patternRow?.daysOfWeek).toEqual(["Monday"]);
});

test("a category with no configured calendar fails the meeting's sync, even if its other category succeeds", async () => {
  // The top-level calendarIdsForMeeting mock always resolves only { AA: "fake-calendar-id" }
  // regardless of calType -- passing "Other" here simulates a real category whose
  // GOOGLE_CALENDAR_* env var isn't set, i.e. calendarIds never contains an "Other" entry.
  mockedCreateCalendarEvent.mockResolvedValue({ id: "fake-event-id", error: null });

  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite (see the "Distinct room" comment further down).
  const payload = buildMeetingPayload({ calType: ["AA", "Other"], room: "Category Sync Room" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  const afterSync = await waitForGoogleSyncStatus(payload.mid);

  // AA's event was created successfully, but "Other" never even attempted to sync (no
  // calendar ID resolved for it) -- the meeting as a whole must still report an error, not
  // a false "synced" from only checking the categories that happened to resolve.
  expect(mockedCreateCalendarEvent).toHaveBeenCalledTimes(1);
  expect(afterSync?.googleSyncStatus).toBe("error");
});

test("a missing access token persists an error status instead of leaving googleSyncStatus null forever", async () => {
  mockedRequireRole.mockResolvedValueOnce({ user: { role: "ADMIN" }, accessToken: undefined });

  // Distinct room -- buildMeetingPayload's default ("Serenity Room") is shared by other tests
  // in this suite (see the "Distinct room" comment further down).
  const payload = buildMeetingPayload({ room: "No Access Token Room" });
  const request = new Request("http://localhost/api/write/meeting", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);

  const afterSync = await waitForGoogleSyncStatus(payload.mid);
  expect(afterSync?.googleSyncStatus).toBe("error");
  expect(afterSync?.googleSyncError).toBeTruthy();
  expect(mockedCreateCalendarEvent).not.toHaveBeenCalled();
});

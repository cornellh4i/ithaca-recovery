import { randomUUID } from "crypto";
import type { IMeeting } from "../../types/models";
import { formatETWeekdayLong } from "../../util/date/timeUtils";

// Same after() shim as update-meeting-route.test.ts -- Next's real after() throws outside a
// request scope, and the deferred sync promise is already constructed (and running) by the time
// after() is called either way, so discarding the reference here doesn't change what runs.
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (task: unknown) => {
    if (typeof task === "function") void (task as () => unknown)();
  },
}));

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "ADMIN", email: "session-admin@test.icr" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdsForMeeting: jest.fn((calType: string[]) =>
    Object.fromEntries(calType.map((cat) => [cat, `cal-${cat}`]))),
  createCalendarEvent: jest.fn().mockResolvedValue({ id: `event-${Math.random()}`, error: null }),
  updateCalendarEvent: jest.fn().mockResolvedValue({ ok: true, error: null }),
  deleteCalendarEvent: jest.fn().mockResolvedValue(true),
  // Only exercised by this file's scope-'all' tests, which fall through to the existing
  // (unmodified) syncUpdatedMeeting path -- an unresolved mock there crashes that function's
  // destructure of this call's return value.
  reconcileMeetingCalendars: jest.fn().mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null }),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  updateZoomMeeting: jest.fn(),
  rehostZoomMeeting: jest.fn(),
  deleteZoomMeeting: jest.fn(),
  getZoomMeetingInvitation: jest.fn().mockResolvedValue(null),
  resolveZoomHost: jest.fn(),
  getZoomHostCapacities: jest.fn().mockResolvedValue({}),
  zoomHostPool: ["mock-pool-host-1@icr.test", "mock-pool-host-2@icr.test"],
  zoomRoomCalendarId: {
    "Scoped Zoom Room": "zoomroom-cal-id", "Scoped Zoom Room 2": "zoomroom-cal-id-2",
    "Null Link Zoom Room": "zoomroom-cal-id-null-link",
  },
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedRecurringMeeting, seedMeeting, seedSuspensionPeriod } from "../factories/meeting";
import { PUT } from "../../app/api/update/meeting/route";
import {
  createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
} from "../../services/googleCalendar";
import { createZoomMeeting, deleteZoomMeeting } from "../../services/zoom";

const mockedCreateCalendarEvent = createCalendarEvent as jest.Mock;
const mockedUpdateCalendarEvent = updateCalendarEvent as jest.Mock;
const mockedDeleteCalendarEvent = deleteCalendarEvent as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedDeleteZoomMeeting = deleteZoomMeeting as jest.Mock;

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result != null) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
}

function putMeeting(payload: Partial<IMeeting> & Record<string, unknown>): Promise<Response> {
  return PUT(new Request("http://localhost/api/update/meeting", { method: "PUT", body: JSON.stringify(payload) }));
}

// Anchored to a real future Monday so the series' weekly pattern and every occurrenceDate below
// derive from the same weekday deterministically, instead of hardcoding day names that could
// silently drift out of sync with the anchor date.
const SERIES_START = new Date("2026-09-07T18:00:00Z");
const SERIES_END = new Date("2026-09-07T19:00:00Z");
const SERIES_WEEKDAY = formatETWeekdayLong(SERIES_START);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const occurrence = (weeksLater: number) => ({
  start: new Date(SERIES_START.getTime() + weeksLater * WEEK_MS),
  end: new Date(SERIES_END.getTime() + weeksLater * WEEK_MS),
});

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedCreateCalendarEvent.mockClear();
  mockedUpdateCalendarEvent.mockClear();
  mockedDeleteCalendarEvent.mockClear();
  mockedCreateZoomMeeting.mockClear();
  mockedDeleteZoomMeeting.mockClear();
});

// The integration DB is only reset once per file (globalSetup), not per test -- and a weekly,
// interval-1 pattern recurs on its weekday forever regardless of its own start-date offset, so
// two tests whose series share the same weekday/time AND the same zoomHost/room would
// permanently overlap and 409 each other via the very conflict-check this suite is testing.
// zid/zoomHost default to a fresh value per call so tests stay isolated from each other without
// having to reason about every other test's schedule; a test asserting a specific shared-Zoom
// scenario overrides these explicitly.
async function seedWeeklySeries(overrides: Partial<Parameters<typeof seedRecurringMeeting>[0]> = {}) {
  return seedRecurringMeeting(
    {
      startDateTime: SERIES_START,
      endDateTime: SERIES_END,
      zid: `${randomUUID()}`,
      zoomHost: `zoom-${randomUUID()}@518icr.com`,
      zoomManaged: true,
      zoomTopic: "Pinned Scoped-Edit Topic",
      modeType: "Remote",
      zoomRoom: null,
      room: "",
      calType: ["AA"],
      ...overrides,
    },
    { type: "weekly", daysOfWeek: [SERIES_WEEKDAY], interval: 1 },
  );
}

const SERIES_DURATION_MS = SERIES_END.getTime() - SERIES_START.getTime();

function scopedPayload(mid: string, editScope: string, occurrenceDate: Date, extra: Record<string, unknown> = {}) {
  return {
    mid,
    title: "Split-off Occurrence",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: occurrenceDate,
    endDateTime: new Date(occurrenceDate.getTime() + SERIES_DURATION_MS),
    email: "scoped-edit@test.icr",
    calType: ["AA"],
    modeType: "Remote",
    room: "",
    zoomRoom: null,
    status: "Active",
    isRecurring: editScope === "thisAndFollowing",
    editScope,
    occurrenceDate,
    ...extra,
  };
}

test("editScope 'this' on a non-recurring meeting is rejected with 400", async () => {
  const meeting = await seedMeeting();
  const response = await putMeeting(scopedPayload(meeting.mid, "this", meeting.startDateTime));
  expect(response.status).toBe(400);
});

test("editScope 'this' without occurrenceDate is rejected with 400", async () => {
  const { meeting } = await seedWeeklySeries();
  const payload = scopedPayload(meeting.mid, "this", occurrence(2).start);
  delete (payload as Record<string, unknown>).occurrenceDate;
  const response = await putMeeting(payload);
  expect(response.status).toBe(400);
});

test("a recurrencePattern under editScope 'this' is rejected with 400", async () => {
  const { meeting } = await seedWeeklySeries();
  const payload = scopedPayload(meeting.mid, "this", occurrence(2).start, {
    recurrencePattern: { type: "weekly", startDate: occurrence(2).start, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1 },
  });
  const response = await putMeeting(payload);
  expect(response.status).toBe(400);
});

test("editScope 'thisAndFollowing' without a recurrencePattern is rejected with 400", async () => {
  const { meeting } = await seedWeeklySeries();
  const response = await putMeeting(scopedPayload(meeting.mid, "thisAndFollowing", occurrence(3).start));
  expect(response.status).toBe(400);
});

test("editScope 'thisAndFollowing' with a startDateTime whose ET date diverges from occurrenceDate is rejected with 400", async () => {
  // The tail series' pattern.startDate anchors to occurrenceDate (the clicked occurrence), while
  // the new row's own startDateTime is whatever the client submits -- these must describe the
  // same calendar date, or the row's own date silently disagrees with the series it claims to
  // start (PR #523 review).
  const { meeting } = await seedWeeklySeries();
  const occurrenceDate = occurrence(3).start;
  const movedStart = new Date(occurrenceDate.getTime() + 24 * 60 * 60 * 1000); // next calendar day
  const movedEnd = new Date(movedStart.getTime() + SERIES_DURATION_MS);

  const response = await putMeeting(scopedPayload(meeting.mid, "thisAndFollowing", occurrenceDate, {
    startDateTime: movedStart,
    endDateTime: movedEnd,
    recurrencePattern: { type: "weekly", startDate: occurrenceDate, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1 },
  }));
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error).toBe("date changes apply to a single event or the whole series");
});

test("editScope 'thisAndFollowing' with startDateTime re-anchored to occurrenceDate (same ET date, different time-of-day) is unaffected", async () => {
  const { meeting } = await seedWeeklySeries();
  const occurrenceDate = occurrence(3).start;
  // Same calendar date as occurrenceDate, but a different wall-clock time -- only the ET DATE
  // has to match, not the exact instant.
  const reAnchoredStart = new Date(occurrenceDate.getTime() + 60 * 60 * 1000);
  const reAnchoredEnd = new Date(reAnchoredStart.getTime() + SERIES_DURATION_MS);

  const response = await putMeeting(scopedPayload(meeting.mid, "thisAndFollowing", occurrenceDate, {
    startDateTime: reAnchoredStart,
    endDateTime: reAnchoredEnd,
    recurrencePattern: { type: "weekly", startDate: occurrenceDate, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1 },
  }));
  expect(response.status).toBe(200);
});

test("editScope 'this' with a moved startDateTime is unaffected by the thisAndFollowing date guard", async () => {
  // Editing the single occurrence's own date is the whole point of scope 'this' -- the new
  // date-match guard is scoped to 'thisAndFollowing' only.
  const { meeting } = await seedWeeklySeries();
  const occurrenceDate = occurrence(2).start;
  const movedStart = new Date(occurrenceDate.getTime() + 24 * 60 * 60 * 1000);
  const movedEnd = new Date(movedStart.getTime() + SERIES_DURATION_MS);

  const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, {
    startDateTime: movedStart,
    endDateTime: movedEnd,
  }));
  expect(response.status).toBe(200);
});

test("an occurrenceDate that isn't a live occurrence of the pattern is rejected with 400", async () => {
  const { meeting } = await seedWeeklySeries();
  // One day off the weekly pattern's day-of-week -- never a live occurrence.
  const offPattern = new Date(occurrence(2).start.getTime() + 24 * 60 * 60 * 1000);
  const response = await putMeeting(scopedPayload(meeting.mid, "this", offPattern));
  expect(response.status).toBe(400);
});

test("editScope 'this' excludes the occurrence on the parent and creates a detached row inheriting Zoom", async () => {
  const { meeting } = await seedWeeklySeries({ googleCalendarEventIds: { AA: "parent-event-aa" } });
  const occurrenceDate = occurrence(2).start;

  const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, { title: "Just This Week" }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.newMid).toBeTruthy();

  const prisma = getTestPrismaClient();
  const parentPattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  expect(parentPattern?.excludedDates).toHaveLength(1);

  const created = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid: body.newMid } });
    return row?.googleSyncStatus != null ? row : null;
  });
  expect(created?.isRecurring).toBe(false);
  expect(created?.splitFromMid).toBe(meeting.mid);
  expect(created?.title).toBe("Just This Week");
  expect(created?.zid).toBe(meeting.zid);
  expect(created?.zoomHost).toBe(meeting.zoomHost);
  expect(created?.zoomManaged).toBe(meeting.zoomManaged);
  expect(created?.zoomTopic).toBe(meeting.zoomTopic);

  // No Zoom API call for the split-off row -- the zid/host/link are inherited, not provisioned.
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
  expect(mockedDeleteZoomMeeting).not.toHaveBeenCalled();
  // Parent's calendar event got a full-body rewrite (no more surgical EXDATE patch) whose
  // recurrence now carries the new exclusion via buildEventBody.
  expect(mockedUpdateCalendarEvent).toHaveBeenCalledTimes(1);
  const [, parentEventId, parentMeetingForCalendar, parentCalId] = mockedUpdateCalendarEvent.mock.calls[0];
  expect(parentEventId).toBe("parent-event-aa");
  expect(parentCalId).toBe("cal-AA");
  expect(parentMeetingForCalendar.recurrencePattern.excludedDates).toHaveLength(1);
  // The new row got its own calType calendar event created.
  expect(mockedCreateCalendarEvent).toHaveBeenCalled();

  // A successful rewrite persists googleSyncStatus 'synced' on the PARENT too, not just the child.
  const parentAfterSync = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    return row?.googleSyncStatus != null ? row : null;
  });
  expect(parentAfterSync?.googleSyncStatus).toBe("synced");
  expect(parentAfterSync?.googleSyncError).toBeNull();
});

test("a failed parent rewrite persists googleSyncStatus 'error' with the error text on the parent", async () => {
  mockedUpdateCalendarEvent.mockResolvedValueOnce({ ok: false, error: "Insufficient Permission" });

  const { meeting } = await seedWeeklySeries({ googleCalendarEventIds: { AA: "parent-event-aa" } });
  const occurrenceDate = occurrence(2).start;

  const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate));
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();
  const parentAfterSync = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    return row?.googleSyncStatus != null ? row : null;
  });
  expect(parentAfterSync?.googleSyncStatus).toBe("error");
  expect(parentAfterSync?.googleSyncError).toBe("Insufficient Permission");
});

test("a configured calType with a missing parent event ID is treated as unsynced, not silently skipped", async () => {
  // No "AA" entry in googleCalendarEventIds even though "AA" is a configured, requested
  // calType -- e.g. a previously-failed sync that never got an event ID to rewrite.
  const { meeting } = await seedWeeklySeries({ googleCalendarEventIds: {} });
  const occurrenceDate = occurrence(2).start;

  const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate));
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();
  const parentAfterSync = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    return row?.googleSyncStatus != null ? row : null;
  });
  // Nothing to rewrite -- there's no event ID for updateCalendarEvent to target.
  expect(mockedUpdateCalendarEvent).not.toHaveBeenCalled();
  expect(parentAfterSync?.googleSyncStatus).toBe("error");
  expect(parentAfterSync?.googleSyncError).toBe('Missing Google Calendar event ID for "AA".');
});

test("fully-populated parent eventIds still lands 'synced'", async () => {
  const { meeting } = await seedWeeklySeries({ googleCalendarEventIds: { AA: "parent-event-aa" } });
  const occurrenceDate = occurrence(2).start;

  const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate));
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();
  const parentAfterSync = await waitFor(async () => {
    const row = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    return row?.googleSyncStatus != null ? row : null;
  });
  expect(parentAfterSync?.googleSyncStatus).toBe("synced");
  expect(parentAfterSync?.googleSyncError).toBeNull();
});

test("editScope 'thisAndFollowing' trims the parent's endDate and creates a new recurring tail series", async () => {
  const { meeting } = await seedWeeklySeries({ googleCalendarEventIds: { AA: "parent-event-aa" } });
  const occurrenceDate = occurrence(3).start;

  const payload = scopedPayload(meeting.mid, "thisAndFollowing", occurrenceDate, {
    title: "New Tail Series",
    recurrencePattern: {
      type: "weekly", startDate: occurrenceDate, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1,
    },
  });
  const response = await putMeeting(payload);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.newMid).toBeTruthy();

  const prisma = getTestPrismaClient();
  const parentPattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  expect(parentPattern?.endDate).not.toBeNull();
  expect(parentPattern!.endDate!.getTime()).toBeLessThan(occurrenceDate.getTime());

  const createdPattern = await waitFor(async () => prisma.recurrencePattern.findUnique({ where: { mid: body.newMid } }));
  expect(createdPattern?.startDate.getTime()).toBe(occurrenceDate.getTime());

  const created = await prisma.meeting.findUnique({ where: { mid: body.newMid } });
  expect(created?.isRecurring).toBe(true);
  expect(created?.splitFromMid).toBe(meeting.mid);
  expect(created?.zid).toBe(meeting.zid);

  expect(parentPattern?.numberOfOccurrences).toBeNull();

  await waitFor(async () => (mockedUpdateCalendarEvent.mock.calls.length > 0 ? true : null));
  expect(mockedUpdateCalendarEvent).toHaveBeenCalledTimes(1);
  const [, parentEventId, parentMeetingForCalendar] = mockedUpdateCalendarEvent.mock.calls[0];
  expect(parentEventId).toBe("parent-event-aa");
  expect(parentMeetingForCalendar.recurrencePattern.endDate.getTime()).toBe(parentPattern!.endDate!.getTime());
  expect(parentMeetingForCalendar.recurrencePattern.numberOfOccurrences).toBeNull();
});

test("a 'thisAndFollowing' trim on a count-bounded series survives a later whole-series (scope 'all') re-edit", async () => {
  // BUG B regression: toRRule used to prefer numberOfOccurrences (COUNT) over endDate, and the
  // trim write left the stale count in place -- a later 'all' edit resubmitting that count (the
  // form derives count-wins from the stored pattern) recomputed calculatedEndDate from it and
  // silently un-trimmed the series. The trim write now explicitly nulls numberOfOccurrences.
  // seedWeeklySeries always seeds interval-1/no-count -- make it count-bounded afterward.
  const { meeting } = await seedWeeklySeries();
  const prisma = getTestPrismaClient();
  await prisma.recurrencePattern.update({
    where: { mid: meeting.mid },
    data: { numberOfOccurrences: 52, endDate: null },
  });

  const occurrenceDate = occurrence(3).start;
  const trimResponse = await putMeeting(scopedPayload(meeting.mid, "thisAndFollowing", occurrenceDate, {
    recurrencePattern: { type: "weekly", startDate: occurrenceDate, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1 },
  }));
  expect(trimResponse.status).toBe(200);

  const trimmedPattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  expect(trimmedPattern?.numberOfOccurrences).toBeNull();
  const trimmedEndDate = trimmedPattern!.endDate!.getTime();
  expect(trimmedEndDate).toBeLessThan(occurrenceDate.getTime());

  // Now resubmit the parent with a form-shaped 'all' payload -- the form round-trips whatever
  // the stored (now-trimmed, now-count-less) pattern already has, so it resends the trimmed
  // endDate itself and no count (there's none left to resend).
  const reEditPayload: Record<string, unknown> = {
    mid: meeting.mid,
    title: meeting.title,
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    email: "scoped-edit@test.icr",
    calType: ["AA"],
    modeType: "Remote",
    room: "",
    status: "Active",
    isRecurring: true,
    recurrencePattern: {
      type: "weekly", startDate: meeting.startDateTime, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1,
      endDate: trimmedPattern!.endDate,
      // numberOfOccurrences deliberately omitted -- pre-fix, a stale stored count would have
      // been resubmitted here instead and recomputed a fresh endDate past the trim point.
    },
  };
  const reEditResponse = await putMeeting(reEditPayload);
  expect(reEditResponse.status).toBe(200);

  const afterReEdit = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  expect(afterReEdit?.numberOfOccurrences).toBeNull();
  expect(afterReEdit?.endDate?.getTime()).toBe(trimmedEndDate);
});

test("a lineage chain propagates the ROOT mid, not the immediate parent's mid", async () => {
  const { meeting: root } = await seedWeeklySeries();
  const firstSplitDate = occurrence(2).start;
  const firstResponse = await putMeeting(scopedPayload(root.mid, "thisAndFollowing", firstSplitDate, {
    recurrencePattern: { type: "weekly", startDate: firstSplitDate, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1 },
  }));
  expect(firstResponse.status).toBe(200);
  const firstBody = await firstResponse.json();

  // The tail series (weekly, unbounded, starting at week 2) also has a live occurrence at week
  // 4 -- splitting IT off again must still credit the ORIGINAL root series, not the tail's own
  // mid, as splitFromMid.
  const secondSplitDate = occurrence(4).start;
  const secondResponse = await putMeeting(scopedPayload(firstBody.newMid, "this", secondSplitDate));
  expect(secondResponse.status).toBe(200);
  const secondBody = await secondResponse.json();

  const prisma = getTestPrismaClient();
  const secondSplitRow = await waitFor(async () => prisma.meeting.findUnique({ where: { mid: secondBody.newMid } }));
  expect(secondSplitRow?.splitFromMid).toBe(root.mid);
});

test("editScope 'this' produces a 409 when the new occurrence conflicts with another meeting's room, and confirmOverride bypasses it", async () => {
  const { meeting } = await seedWeeklySeries({ modeType: "In Person", room: "Scoped Conflict Room" });
  const occ = occurrence(2);

  await seedMeeting({ room: "Scoped Conflict Room", startDateTime: occ.start, endDateTime: occ.end });

  const blocked = await putMeeting(scopedPayload(meeting.mid, "this", occ.start, { modeType: "In Person", room: "Scoped Conflict Room" }));
  expect(blocked.status).toBe(409);
  const blockedBody = await blocked.json();
  expect(blockedBody.conflicts).toBeDefined();

  // The parent's exclusion must not have been written on the aborted attempt.
  const prisma = getTestPrismaClient();
  const parentPatternAfterAbort = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  expect(parentPatternAfterAbort?.excludedDates ?? []).toHaveLength(0);

  const overridden = await putMeeting(scopedPayload(meeting.mid, "this", occ.start, {
    modeType: "In Person", room: "Scoped Conflict Room", confirmOverride: true,
  }));
  expect(overridden.status).toBe(200);
});

test("a stranded pending-resume series past the trimmed endDate is torn down", async () => {
  const { meeting } = await seedWeeklySeries();
  const trimAt = occurrence(2).start;
  const farFutureResumeDate = occurrence(20).start;

  await seedSuspensionPeriod(meeting.mid, {
    from: new Date(meeting.startDateTime.getTime() - 24 * 60 * 60 * 1000),
    to: farFutureResumeDate,
    promoted: false,
    resumeEventIds: { AA: "stale-resume-event" },
  });

  const response = await putMeeting(scopedPayload(meeting.mid, "thisAndFollowing", trimAt, {
    recurrencePattern: { type: "weekly", startDate: trimAt, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1 },
  }));
  expect(response.status).toBe(200);

  await waitFor(async () => (mockedDeleteCalendarEvent.mock.calls.length > 0 ? true : null));
  expect(mockedDeleteCalendarEvent).toHaveBeenCalledWith("fake-token", "stale-resume-event", "cal-AA");
});

test("excludedDates candidate bug fix: a series with a prior 'this' exclusion can be re-saved (scope 'all') without a false self-conflict", async () => {
  const { meeting, recurrencePattern } = await seedWeeklySeries({ modeType: "In Person", room: "Regression Room", zid: null, zoomHost: null });
  const excludedOccurrence = occurrence(2);

  const prisma = getTestPrismaClient();
  await prisma.recurrencePattern.update({
    where: { mid: recurrencePattern.mid },
    data: { excludedDates: { push: excludedOccurrence.start } },
  });

  // A one-time meeting legitimately booked in the same room, at the exact date/time the series
  // itself no longer occupies (it's excluded) -- pre-fix, resubmitting the series without its
  // excludedDates in the payload would expand the candidate as if that date were still live and
  // falsely 409 against this booking.
  await seedMeeting({ room: "Regression Room", startDateTime: excludedOccurrence.start, endDateTime: excludedOccurrence.end });

  const editPayload: Record<string, unknown> = {
    mid: meeting.mid,
    title: "Resaved Series",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    email: "scoped-edit@test.icr",
    calType: ["AA"],
    modeType: "In Person",
    room: "Regression Room",
    status: "Active",
    isRecurring: true,
    recurrencePattern: {
      type: "weekly", startDate: meeting.startDateTime, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1,
      // excludedDates deliberately omitted -- the client doesn't resubmit per-occurrence
      // deletions on a plain field edit.
    },
  };
  const response = await putMeeting(editPayload);
  expect(response.status).toBe(200);
});

test("editScope 'all' (omitted) behaves exactly as before -- a single-series in-place edit, no split row", async () => {
  const { meeting } = await seedWeeklySeries({ modeType: "In Person", room: "Plain Edit Room", zid: null, zoomHost: null });

  const editPayload: Record<string, unknown> = {
    mid: meeting.mid,
    title: "Plainly Edited",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    email: "scoped-edit@test.icr",
    calType: ["AA"],
    modeType: "In Person",
    room: "Plain Edit Room",
    status: "Active",
    isRecurring: true,
    recurrencePattern: {
      type: "weekly", startDate: meeting.startDateTime, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1,
    },
  };
  const response = await putMeeting(editPayload);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.newMid).toBeUndefined();

  const prisma = getTestPrismaClient();
  const rowCount = await prisma.meeting.count({ where: { OR: [{ mid: meeting.mid }, { splitFromMid: meeting.mid }] } });
  expect(rowCount).toBe(1);
  const stored = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
  expect(stored?.title).toBe("Plainly Edited");
});

// Zoom-Room moves: the Zoom meeting is host-owned, not room-owned, so a scoped edit's split-off
// row is free to publish on a different Zoom Room than the parent while keeping the inherited
// zid/link/passcode/host working.
describe("scoped edit Zoom Room moves", () => {
  function hybridSeries(overrides: Partial<Parameters<typeof seedRecurringMeeting>[0]> = {}) {
    return seedWeeklySeries({
      modeType: "Hybrid",
      room: `Test Room ${randomUUID()}`,
      zoomRoom: "Scoped Zoom Room",
      zoomCalendarEventId: "parent-room-event",
      zoomLink: `https://zoom.us/j/${randomUUID()}`,
      ...overrides,
    });
  }

  test("moves the child to a new Zoom Room -- its own room-cal event, parent's own event untouched by room", async () => {
    const { meeting } = await hybridSeries({ googleCalendarEventIds: { AA: "parent-event-aa" } });
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, {
      modeType: "Hybrid", room: meeting.room, zoomRoom: "Scoped Zoom Room 2",
    }));
    expect(response.status).toBe(200);
    const body = await response.json();

    const prisma = getTestPrismaClient();
    const created = await waitFor(async () => {
      const row = await prisma.meeting.findUnique({ where: { mid: body.newMid } });
      return row?.googleSyncStatus != null ? row : null;
    });
    expect(created?.zoomRoom).toBe("Scoped Zoom Room 2");
    // Zoom identity still inherited regardless of room.
    expect(created?.zid).toBe(meeting.zid);
    expect(created?.zoomLink).toBe(meeting.zoomLink);
    expect(created?.zoomHost).toBe(meeting.zoomHost);
    expect(created?.zoomManaged).toBe(meeting.zoomManaged);

    // The child's own room-cal event was created on the NEW room's calendar with the inherited
    // join link as its location.
    const roomCalCall = mockedCreateCalendarEvent.mock.calls.find((call) => call[2] === "zoomroom-cal-id-2");
    expect(roomCalCall).toBeDefined();
    expect(roomCalCall![3]).toBe(meeting.zoomLink);

    // The parent's own room-cal event still exists and was rewritten (full-body), not deleted --
    // it keeps living on room 1's calendar.
    const parentRoomCalCall = mockedUpdateCalendarEvent.mock.calls.find((call) => call[1] === "parent-room-event");
    expect(parentRoomCalCall).toBeDefined();
    expect(parentRoomCalCall![3]).toBe("zoomroom-cal-id");
  });

  test("a Remote child (no zoomRoom at all) skips room-cal creation cleanly", async () => {
    // meetingSchema requires a Hybrid meeting to carry both room and zoomRoom, so "removed" only
    // has a real meaning for a Remote series (zoomRoom always null/absent) -- exercised here
    // explicitly since the Hybrid tests above never take this path.
    const { meeting } = await seedWeeklySeries({ googleCalendarEventIds: { AA: "parent-event-aa" } });
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, {
      modeType: "Remote", room: "", zoomRoom: null,
    }));
    expect(response.status).toBe(200);
    const body = await response.json();

    const prisma = getTestPrismaClient();
    const created = await waitFor(async () => {
      const row = await prisma.meeting.findUnique({ where: { mid: body.newMid } });
      return row?.googleSyncStatus != null ? row : null;
    });
    expect(created?.zoomRoom).toBeNull();
    expect(created?.zoomCalendarEventId).toBeNull();

    // Only the calType event was created for the child -- no room-cal call at all.
    const roomCalCalls = mockedCreateCalendarEvent.mock.calls.filter((call) => call[2]?.startsWith("zoomroom-cal-id"));
    expect(roomCalCalls).toHaveLength(0);
  });

  test("a zoomRoom conflict on the child's dates is rejected with 409, and confirmOverride bypasses it", async () => {
    const { meeting } = await hybridSeries();
    const occ = occurrence(2);
    await seedMeeting({
      modeType: "Hybrid", room: `Busy Room ${randomUUID()}`, zoomRoom: "Scoped Zoom Room 2",
      startDateTime: occ.start, endDateTime: occ.end,
    });

    const blocked = await putMeeting(scopedPayload(meeting.mid, "this", occ.start, {
      modeType: "Hybrid", room: meeting.room, zoomRoom: "Scoped Zoom Room 2",
    }));
    expect(blocked.status).toBe(409);
    const blockedBody = await blocked.json();
    expect(blockedBody.conflicts[0]).toMatchObject({ field: "zoomRoom", value: "Scoped Zoom Room 2" });

    const overridden = await putMeeting(scopedPayload(meeting.mid, "this", occ.start, {
      modeType: "Hybrid", room: meeting.room, zoomRoom: "Scoped Zoom Room 2", confirmOverride: true,
    }));
    expect(overridden.status).toBe(200);
  });

  test("a suspended parent's scoped edit never rewrites its room-cal event either", async () => {
    const { meeting } = await hybridSeries({ status: "Suspended", googleCalendarEventIds: { AA: "parent-event-aa" } });
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, {
      modeType: "Hybrid", room: meeting.room, zoomRoom: "Scoped Zoom Room", status: "Suspended",
    }));
    expect(response.status).toBe(200);
    await waitFor(async () => (mockedCreateCalendarEvent.mock.calls.length > 0 ? true : null));

    expect(mockedUpdateCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("scoped edit rejects whole-series-only field changes", () => {
  test("a modeType change is rejected with 400 (\"mode changes apply to the whole series\")", async () => {
    const { meeting } = await seedWeeklySeries({ modeType: "Remote" });
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, { modeType: "In Person", room: "Some Room" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("mode changes apply to the whole series");
  });

  test("an explicit zoomHost change is rejected with 400 (\"host changes apply to the whole series\")", async () => {
    // Unique per-call host (seedWeeklySeries' default) -- a fixed literal shared with another
    // test in this file would collide as a real zoomHost conflict (capacity 1) via the exact
    // same occurrence(2) slot every scoped-edit test in this file targets.
    const { meeting } = await seedWeeklySeries();
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, { zoomHost: `different-host-${randomUUID()}@518icr.com` }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("host changes apply to the whole series");
  });

  test("resubmitting the parent's own already-assigned host (any casing) is NOT treated as a change", async () => {
    const { meeting } = await seedWeeklySeries();
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, { zoomHost: meeting.zoomHost!.toUpperCase() }));
    expect(response.status).toBe(200);
  });

  test("a blank/omitted zoomHost is NOT treated as a change", async () => {
    const { meeting } = await seedWeeklySeries();
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, { zoomHost: null }));
    expect(response.status).toBe(200);
  });

  test("the parent's own host with surrounding whitespace is NOT treated as a change", async () => {
    const { meeting } = await seedWeeklySeries();
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, { zoomHost: ` ${meeting.zoomHost!} ` }));
    expect(response.status).toBe(200);
  });
});

describe("scoped edit conflict scan no longer excludes the parent for room/zoomRoom", () => {
  test("a 'this' child re-dated onto another day the series meets, same room, is rejected 409 -- the parent's live occurrence on that day is no longer hidden from the scan", async () => {
    const wednesdayName = formatETWeekdayLong(new Date(SERIES_START.getTime() + 2 * 24 * 60 * 60 * 1000));
    const room = `Multi-Day Room ${randomUUID()}`;
    const { meeting } = await seedRecurringMeeting(
      {
        startDateTime: SERIES_START, endDateTime: SERIES_END,
        modeType: "In Person", room, zoomRoom: null, zid: null, zoomHost: null, calType: ["AA"],
      },
      { type: "weekly", daysOfWeek: [SERIES_WEEKDAY, wednesdayName], interval: 1 },
    );

    // occurrenceDate (the Monday being edited) gets excluded from the parent -- but the child is
    // re-dated onto the SAME week's Wednesday, which the parent's pattern still produces (only
    // the Monday date was excluded), in the identical room.
    const mondayOccurrence = occurrence(2);
    const wednesdayStart = new Date(mondayOccurrence.start.getTime() + 2 * 24 * 60 * 60 * 1000);
    const wednesdayEnd = new Date(mondayOccurrence.end.getTime() + 2 * 24 * 60 * 60 * 1000);

    const response = await putMeeting(scopedPayload(meeting.mid, "this", mondayOccurrence.start, {
      modeType: "In Person", room, startDateTime: wednesdayStart, endDateTime: wednesdayEnd,
    }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.conflicts[0]).toMatchObject({ field: "room", value: room });
  });

  test("a 'this' child NOT re-dated (same occurrence date) does not self-conflict with the parent's own just-excluded date", async () => {
    const room = `Same Day Room ${randomUUID()}`;
    const { meeting } = await seedRecurringMeeting(
      {
        startDateTime: SERIES_START, endDateTime: SERIES_END,
        modeType: "In Person", room, zoomRoom: null, zid: null, zoomHost: null, calType: ["AA"],
      },
      { type: "weekly", daysOfWeek: [SERIES_WEEKDAY], interval: 1 },
    );
    const occ = occurrence(2);
    const response = await putMeeting(scopedPayload(meeting.mid, "this", occ.start, { modeType: "In Person", room }));
    expect(response.status).toBe(200);
  });

  test("zoomHost still excludes the parent for scope 'this' -- sharing the inherited zid/host is not a real conflict", async () => {
    const { meeting } = await seedWeeklySeries();
    const occ = occurrence(2);
    const response = await putMeeting(scopedPayload(meeting.mid, "this", occ.start, { zoomHost: meeting.zoomHost }));
    expect(response.status).toBe(200);
  });
});

describe("scoped edit on a suspended parent", () => {
  test("creates an Active child whose events publish, while the parent's own calendar rewrite is skipped", async () => {
    const { meeting } = await seedWeeklySeries({
      status: "Suspended", googleCalendarEventIds: { AA: "parent-event-aa" }, googleSyncStatus: "synced",
    });
    const occurrenceDate = occurrence(2).start;

    // The payload mirrors the parent's own (suspended) status, as a client that round-trips the
    // fetched meeting's status might -- the child must come out Active regardless.
    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, {
      title: "Split While Suspended", status: "Suspended",
    }));
    expect(response.status).toBe(200);
    const body = await response.json();

    const prisma = getTestPrismaClient();
    const created = await waitFor(async () => {
      const row = await prisma.meeting.findUnique({ where: { mid: body.newMid } });
      return row?.googleSyncStatus != null ? row : null;
    });
    expect(created?.status).toBe("Active");
    // A split-off row has no suspension history -- its events ARE published, unlike the parent's.
    expect(created?.googleSyncStatus).toBe("synced");
    expect(mockedCreateCalendarEvent).toHaveBeenCalled();

    // The parent's own full-body rewrite is still skipped -- it's still suspended.
    expect(mockedUpdateCalendarEvent).not.toHaveBeenCalled();
    // The suspended-skip is a deferral, not a failure -- the parent's own googleSyncStatus is
    // left exactly as it was, never flipped to 'error'.
    const parentAfter = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    expect(parentAfter?.googleSyncStatus).toBe("synced");
  });
});

describe("scoped edit parent room-cal rewrite with a null zoomLink", () => {
  test("skips the room-cal rewrite entirely -- never falls back to publishing the street address", async () => {
    const { meeting } = await seedWeeklySeries({
      modeType: "Hybrid",
      room: `Null Link Room ${randomUUID()}`,
      zoomRoom: "Null Link Zoom Room",
      zoomCalendarEventId: "parent-room-event-null-link",
      zoomLink: null,
      googleCalendarEventIds: { AA: "parent-event-aa" },
    });
    const occurrenceDate = occurrence(2).start;

    const response = await putMeeting(scopedPayload(meeting.mid, "this", occurrenceDate, {
      modeType: "Hybrid", room: meeting.room, zoomRoom: "Null Link Zoom Room",
    }));
    expect(response.status).toBe(200);
    const body = await response.json();

    // Wait for the deferred parent rewrite to have had its chance to run (via the child's own
    // sync, which lands after the parent's in the after() ordering).
    const prisma = getTestPrismaClient();
    await waitFor(async () => {
      const row = await prisma.meeting.findUnique({ where: { mid: body.newMid } });
      return row?.googleSyncStatus != null ? row : null;
    });

    // The calType event was still rewritten -- only the room-cal event (which would otherwise
    // fall back to the street address) was skipped.
    expect(mockedUpdateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mockedUpdateCalendarEvent).not.toHaveBeenCalledWith(
      expect.anything(), "parent-room-event-null-link", expect.anything(), expect.anything(), expect.anything(),
    );
  });
});

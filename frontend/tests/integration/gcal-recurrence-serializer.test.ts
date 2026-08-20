// Cross-route regressions for the buildEventBody recurrence-serializer fix (BUG A: a full
// events.update used to regenerate a bare RRULE with no EXDATEs, resurrecting every
// previously-removed occurrence on Google Calendar; BUG B: a 'thisAndFollowing' trim on a
// count-bounded series could be un-trimmed by a later whole-series edit resubmitting the stale
// count). Exercises DELETE (delete/meeting) and PUT (update/meeting) together, since BUG A's
// real-world trigger is exactly this sequence: delete-'this' (or edit-'this') excludes an
// occurrence, then an unrelated later whole-series edit must not drop it.
import { randomUUID } from "crypto";
import type { IMeeting } from "../../types/models";

const mockCapturedAfterTasks: Promise<unknown>[] = [];
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (task: unknown) => {
    mockCapturedAfterTasks.push(Promise.resolve(task));
  },
}));

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "ADMIN", email: "session-admin@test.icr" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdsForMeeting: jest.fn().mockReturnValue({ AA: "cal-AA" }),
  createCalendarEvent: jest.fn().mockResolvedValue({ id: "new-event-id", error: null }),
  updateCalendarEvent: jest.fn().mockResolvedValue({ ok: true, error: null }),
  deleteCalendarEvent: jest.fn().mockResolvedValue(true),
  reconcileMeetingCalendars: jest.fn().mockResolvedValue({ updatedEventIds: { AA: "cal-event-aa" }, allSynced: true, googleSyncError: null }),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  updateZoomMeeting: jest.fn(),
  rehostZoomMeeting: jest.fn(),
  deleteZoomMeeting: jest.fn(),
  getZoomMeetingInvitation: jest.fn().mockResolvedValue(null),
  resolveZoomHost: jest.fn(),
  getZoomHostCapacities: jest.fn().mockResolvedValue({}),
  zoomHostPool: [],
  zoomRoomCalendarId: {},
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedRecurringMeeting } from "../factories/meeting";
import { formatETWeekdayLong } from "../../util/date/timeUtils";
import { DELETE } from "../../app/api/delete/meeting/route";
import { PUT } from "../../app/api/update/meeting/route";
import { updateCalendarEvent, reconcileMeetingCalendars } from "../../services/googleCalendar";

const mockedUpdateCalendarEvent = updateCalendarEvent as jest.Mock;
const mockedReconcile = reconcileMeetingCalendars as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedUpdateCalendarEvent.mockClear();
  mockedReconcile.mockClear();
  mockCapturedAfterTasks.length = 0;
});

async function drainAfterTasks(): Promise<void> {
  await Promise.all(mockCapturedAfterTasks.splice(0, mockCapturedAfterTasks.length));
}

const SERIES_START = new Date("2026-10-05T18:00:00Z"); // a Monday
const SERIES_END = new Date("2026-10-05T19:00:00Z");
const SERIES_WEEKDAY = formatETWeekdayLong(SERIES_START);

test("delete-'this' then a plain whole-series ('all') edit still carries the EXDATE into the calendar sync", async () => {
  const { meeting } = await seedRecurringMeeting(
    { startDateTime: SERIES_START, endDateTime: SERIES_END, room: `Test Room ${randomUUID()}`, googleCalendarEventIds: { AA: "parent-event-aa" } },
    { type: "weekly", daysOfWeek: [SERIES_WEEKDAY], interval: 1 },
  );
  const excludedOccurrence = new Date(SERIES_START.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks later, same weekday

  // 1. delete-'this' on one occurrence.
  const deleteResponse = await DELETE(new Request("http://localhost/api/delete/meeting", {
    method: "DELETE",
    body: JSON.stringify({ mid: meeting.mid, deleteOption: "this", occurrenceDate: excludedOccurrence.toISOString() }),
  }));
  expect(deleteResponse.status).toBe(200);
  await drainAfterTasks();

  // The delete route's own full-body rewrite must have carried the new exclusion.
  expect(mockedUpdateCalendarEvent).toHaveBeenCalledTimes(1);
  expect(mockedUpdateCalendarEvent.mock.calls[0][2].recurrencePattern.excludedDates).toHaveLength(1);

  const prisma = getTestPrismaClient();
  const patternAfterDelete = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  expect(patternAfterDelete?.excludedDates).toHaveLength(1);

  // 2. An unrelated whole-series edit (editScope 'all'/omitted) -- the client payload's
  // recurrencePattern does NOT resubmit excludedDates, mirroring a form that doesn't manage
  // per-occurrence deletions.
  const editPayload: Partial<IMeeting> & Record<string, unknown> = {
    mid: meeting.mid,
    title: "Renamed During Whole-Series Edit",
    description: meeting.description,
    creator: meeting.creator,
    group: meeting.group,
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    email: meeting.email,
    calType: meeting.calType,
    modeType: meeting.modeType,
    room: meeting.room,
    status: "Active",
    isRecurring: true,
    recurrencePattern: {
      type: "weekly", startDate: meeting.startDateTime, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1,
      // excludedDates deliberately omitted.
    },
  };
  const editResponse = await PUT(new Request("http://localhost/api/update/meeting", {
    method: "PUT", body: JSON.stringify(editPayload),
  }));
  expect(editResponse.status).toBe(200);
  await drainAfterTasks();

  // BUG A regression: without the fix, this call's meeting argument's excludedDates would be
  // empty (the client never resubmitted it), and buildEventBody would silently omit the EXDATE,
  // resurrecting the deleted occurrence on Google Calendar.
  expect(mockedReconcile).toHaveBeenCalledTimes(1);
  const meetingForCalendar = mockedReconcile.mock.calls[0][1];
  expect(meetingForCalendar.recurrencePattern.excludedDates).toHaveLength(1);
  expect(new Date(meetingForCalendar.recurrencePattern.excludedDates[0]).getTime())
    .toBe(patternAfterDelete!.excludedDates[0].getTime());
});

test("a 'thisAndFollowing' delete-trim on a count-bounded series survives a later whole-series edit that round-trips the now-count-less stored pattern", async () => {
  const { meeting } = await seedRecurringMeeting(
    { startDateTime: SERIES_START, endDateTime: SERIES_END, room: `Test Room ${randomUUID()}` },
    { type: "weekly", daysOfWeek: [SERIES_WEEKDAY], interval: 1, numberOfOccurrences: 30, endDate: null },
  );
  const trimAt = new Date(SERIES_START.getTime() + 21 * 24 * 60 * 60 * 1000); // 3 weeks later

  const deleteResponse = await DELETE(new Request("http://localhost/api/delete/meeting", {
    method: "DELETE",
    body: JSON.stringify({ mid: meeting.mid, deleteOption: "thisAndFollowing", occurrenceDate: trimAt.toISOString() }),
  }));
  expect(deleteResponse.status).toBe(200);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const trimmedPattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  // The fix's actual mechanism: nulling the count AT THE TRIM WRITE means the stored pattern a
  // form would later read back out has nothing stale to resubmit -- confirmed here before the
  // re-edit even happens.
  expect(trimmedPattern?.numberOfOccurrences).toBeNull();
  expect(trimmedPattern?.endDate).not.toBeNull();
  const trimmedEndDate = trimmedPattern!.endDate!.getTime();

  // A whole-series edit that round-trips exactly what the (now-trimmed, now-count-less) stored
  // pattern has -- no count to resubmit, so calculatedEndDate has nothing to recompute from.
  const editPayload: Partial<IMeeting> & Record<string, unknown> = {
    mid: meeting.mid,
    title: meeting.title,
    description: meeting.description,
    creator: meeting.creator,
    group: meeting.group,
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    email: meeting.email,
    calType: meeting.calType,
    modeType: meeting.modeType,
    room: meeting.room,
    status: "Active",
    isRecurring: true,
    recurrencePattern: {
      type: "weekly", startDate: meeting.startDateTime, daysOfWeek: [SERIES_WEEKDAY], firstDayOfWeek: "Sunday", interval: 1,
      endDate: trimmedPattern!.endDate,
    },
  };
  const editResponse = await PUT(new Request("http://localhost/api/update/meeting", {
    method: "PUT", body: JSON.stringify(editPayload),
  }));
  expect(editResponse.status).toBe(200);

  const afterReEdit = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
  expect(afterReEdit?.numberOfOccurrences).toBeNull();
  expect(afterReEdit?.endDate?.getTime()).toBe(trimmedEndDate);
});

test("a suspended parent's 'this' scoped edit never rewrites its calendar event", async () => {
  const { meeting } = await seedRecurringMeeting(
    { startDateTime: SERIES_START, endDateTime: SERIES_END, room: `Test Room ${randomUUID()}`, status: "Suspended", googleCalendarEventIds: { AA: "parent-event-aa" } },
    { type: "weekly", daysOfWeek: [SERIES_WEEKDAY], interval: 1 },
  );
  const occurrenceDate = new Date(SERIES_START.getTime() + 14 * 24 * 60 * 60 * 1000);

  const editPayload: Partial<IMeeting> & Record<string, unknown> = {
    mid: meeting.mid,
    title: "Edited While Suspended",
    description: meeting.description,
    creator: meeting.creator,
    group: meeting.group,
    startDateTime: occurrenceDate,
    endDateTime: new Date(occurrenceDate.getTime() + 60 * 60 * 1000),
    email: meeting.email,
    calType: meeting.calType,
    modeType: meeting.modeType,
    room: meeting.room,
    zoomRoom: null,
    status: "Suspended",
    isRecurring: false,
    editScope: "this",
    occurrenceDate,
  };
  const response = await PUT(new Request("http://localhost/api/update/meeting", {
    method: "PUT", body: JSON.stringify(editPayload),
  }));
  expect(response.status).toBe(200);
  await drainAfterTasks();

  expect(mockedUpdateCalendarEvent).not.toHaveBeenCalled();
});

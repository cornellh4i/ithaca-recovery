import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting, seedRecurringMeeting, seedSuspensionPeriod } from "../factories/meeting";

// The route always passes an already-started promise to after() (syncDeleteAll etc. are invoked
// eagerly as part of constructing the argument, before after() ever sees it) -- capturing that
// promise here gives tests a real completion signal to await (see drainAfterTasks below),
// instead of inferring "the background sync must be done by now" from elapsed time.
const mockCapturedAfterTasks: Promise<unknown>[] = [];
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (task: unknown) => {
    mockCapturedAfterTasks.push(Promise.resolve(task));
  },
}));

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "ADMIN" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdsForMeeting: jest.fn().mockReturnValue({ AA: "fake-calendar-id" }),
  deleteCalendarEvent: jest.fn().mockResolvedValue(true),
  updateCalendarEvent: jest.fn().mockResolvedValue({ ok: true, error: null }),
}));

jest.mock("../../services/zoom", () => ({
  deleteZoomMeeting: jest.fn().mockResolvedValue(true),
  zoomRoomCalendarId: { "Delete Route Zoom Room": "fake-room-calendar-id" },
}));

import { deleteCalendarEvent, updateCalendarEvent } from "../../services/googleCalendar";
import { deleteZoomMeeting } from "../../services/zoom";
import { DELETE } from "../../app/api/delete/meeting/route";

const mockedDelete = deleteCalendarEvent as jest.Mock;
const mockedUpdate = updateCalendarEvent as jest.Mock;
const mockedDeleteZoom = deleteZoomMeeting as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedDelete.mockClear();
  mockedUpdate.mockClear();
  mockedDeleteZoom.mockClear();
  mockCapturedAfterTasks.length = 0;
});

// Awaits every after()-deferred task captured by a DELETE call so far, then clears the list.
// This is the actual condition these tests need -- "the background sync has fully finished,
// including every sequential await inside it" -- not a guess at how long that takes; it works
// equally well for a positive assertion (an event ID that should now exist) and a negative one
// (asserting no further call landed), since either way nothing is left in flight once it resolves.
async function drainAfterTasks(): Promise<void> {
  await Promise.all(mockCapturedAfterTasks.splice(0, mockCapturedAfterTasks.length));
}

test("deleting a meeting whose Zoom meeting is unmanaged never deletes it from Zoom", async () => {
  const meeting = await seedMeeting({ zid: "89296128710", zoomManaged: false });

  const response = await DELETE(new Request("http://localhost/api/delete/meeting", {
    method: "DELETE", body: JSON.stringify({ mid: meeting.mid, deleteOption: "all" }),
  }));
  expect(response.status).toBe(200);
  await drainAfterTasks();
  expect(mockedDeleteZoom).not.toHaveBeenCalled();
});

test("a managed Zoom meeting shared by two rows survives until the last referencing row is deleted", async () => {
  // Unique to this test: the sibling count is a real DB query, and suites share the embedded
  // Postgres — reusing a zid another suite seeds would make the count see foreign rows.
  const shared = "70000000777";
  const a = await seedMeeting({ zid: shared, zoomManaged: true, title: "Shared Pair A" });
  const b = await seedMeeting({ zid: shared, zoomManaged: true, title: "Shared Pair B" });

  let response = await DELETE(new Request("http://localhost/api/delete/meeting", {
    method: "DELETE", body: JSON.stringify({ mid: a.mid, deleteOption: "all" }),
  }));
  expect(response.status).toBe(200);
  await drainAfterTasks();
  expect(mockedDeleteZoom).not.toHaveBeenCalled();

  response = await DELETE(new Request("http://localhost/api/delete/meeting", {
    method: "DELETE", body: JSON.stringify({ mid: b.mid, deleteOption: "all" }),
  }));
  expect(response.status).toBe(200);
  await drainAfterTasks();
  expect(mockedDeleteZoom).toHaveBeenCalledWith("70000000777");
});

test("deleting a managed meeting still tears its Zoom meeting down", async () => {
  const meeting = await seedMeeting({ zid: "80000000001", zoomManaged: true });

  const response = await DELETE(new Request("http://localhost/api/delete/meeting", {
    method: "DELETE", body: JSON.stringify({ mid: meeting.mid, deleteOption: "all" }),
  }));
  expect(response.status).toBe(200);
  await drainAfterTasks();
  expect(mockedDeleteZoom).toHaveBeenCalledWith("80000000001");
});

test("deleting a meeting with a pending pre-created resume series tears that series down too, not just the live event", async () => {
  const { meeting } = await seedRecurringMeeting({
    status: "Suspended",
    googleCalendarEventIds: { AA: "live-event-id" },
  });
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await seedSuspensionPeriod(meeting.mid, { to: future, resumeEventIds: { AA: "pending-future-event-id" } });

  const request = new Request("http://localhost/api/delete/meeting", {
    method: "DELETE",
    body: JSON.stringify({ mid: meeting.mid, deleteOption: "all" }),
  });
  const response = await DELETE(request);
  expect(response.status).toBe(200);

  // deletedAt is written synchronously in the route, before after() is even called -- no wait
  // needed for it.
  const prisma = getTestPrismaClient();
  const deleted = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
  expect(deleted?.deletedAt).not.toBeNull();

  await drainAfterTasks();
  expect(mockedDelete).toHaveBeenCalledTimes(2);
  expect(mockedDelete).toHaveBeenCalledWith("fake-token", "live-event-id", "fake-calendar-id");
  expect(mockedDelete).toHaveBeenCalledWith("fake-token", "pending-future-event-id", "fake-calendar-id");
});

test("deleting a meeting with no pending resume series only tears down the live event", async () => {
  const meeting = await seedMeeting({ googleCalendarEventIds: { AA: "live-event-id" } });

  const request = new Request("http://localhost/api/delete/meeting", {
    method: "DELETE",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await DELETE(request);
  expect(response.status).toBe(200);

  // Awaiting the actual syncDeleteAll promise (not a settle-window guess) is what proves no
  // further deleteCalendarEvent call is still in flight -- every sequential await inside it,
  // including tearDownPendingResumeSeries and the Zoom-room calendar delete, has resolved by
  // the time this returns.
  await drainAfterTasks();
  expect(mockedDelete).toHaveBeenCalledTimes(1);
  expect(mockedDelete).toHaveBeenCalledWith("fake-token", "live-event-id", "fake-calendar-id");
});

test("a promoted (already-live) suspension row isn't torn down a second time", async () => {
  const meeting = await seedMeeting({ googleCalendarEventIds: { AA: "live-event-id" } });
  // Already promoted -- resumeEventIds now describes what's live, covered by the delete-all
  // sync above already, not a separately-orphaned pending series.
  await seedSuspensionPeriod(meeting.mid, {
    to: new Date(Date.now() - 24 * 60 * 60 * 1000),
    resumeEventIds: { AA: "live-event-id" },
    promoted: true,
  });

  const request = new Request("http://localhost/api/delete/meeting", {
    method: "DELETE",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await DELETE(request);
  expect(response.status).toBe(200);

  // Same reasoning as above -- confirms the promoted row really isn't torn down a second time,
  // not just that it hadn't happened yet by some guessed deadline.
  await drainAfterTasks();
  expect(mockedDelete).toHaveBeenCalledTimes(1);
});

// The 'this'/'thisAndFollowing' branches previously had no DB-write coverage at all -- added
// alongside the EXDATE/full-body-rewrite fix below, since both branches' sync mechanics changed.
describe("deleteOption 'this' / 'thisAndFollowing'", () => {
  test("'this' pushes an excludedDates entry and rewrites the calendar event's full body (EXDATE, not a patch)", async () => {
    const { meeting } = await seedRecurringMeeting(
      { googleCalendarEventIds: { AA: "live-event-id" } },
      { type: "weekly", daysOfWeek: ["Monday"], interval: 1 },
    );
    const occurrenceDate = new Date("2026-09-14T18:00:00Z"); // a Monday

    const response = await DELETE(new Request("http://localhost/api/delete/meeting", {
      method: "DELETE",
      body: JSON.stringify({ mid: meeting.mid, deleteOption: "this", occurrenceDate: occurrenceDate.toISOString() }),
    }));
    expect(response.status).toBe(200);

    const prisma = getTestPrismaClient();
    const pattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
    expect(pattern?.excludedDates).toHaveLength(1);

    await drainAfterTasks();
    // No surgical patch call left at all -- deleteCalendarOccurrence is gone; the whole event
    // body (with the RRULE + EXDATE buildEventBody now derives from the pattern) is rewritten
    // via a plain events.update instead.
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const [, eventId, meetingForCalendar, calendarId] = mockedUpdate.mock.calls[0];
    expect(eventId).toBe("live-event-id");
    expect(calendarId).toBe("fake-calendar-id");
    expect(meetingForCalendar.recurrencePattern.excludedDates).toHaveLength(1);
  });

  test("'thisAndFollowing' trims endDate, nulls numberOfOccurrences, and rewrites the calendar event", async () => {
    const { meeting } = await seedRecurringMeeting(
      { googleCalendarEventIds: { AA: "live-event-id" } },
      { type: "weekly", daysOfWeek: ["Monday"], interval: 1, numberOfOccurrences: 20, endDate: null },
    );
    const occurrenceDate = new Date("2026-09-14T18:00:00Z"); // a Monday

    const response = await DELETE(new Request("http://localhost/api/delete/meeting", {
      method: "DELETE",
      body: JSON.stringify({ mid: meeting.mid, deleteOption: "thisAndFollowing", occurrenceDate: occurrenceDate.toISOString() }),
    }));
    expect(response.status).toBe(200);

    const prisma = getTestPrismaClient();
    const pattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
    expect(pattern?.endDate).not.toBeNull();
    expect(pattern!.endDate!.getTime()).toBeLessThan(occurrenceDate.getTime());
    // The count-bounded regression this whole fix targets: without nulling this, a later
    // whole-series edit resubmitting the stored count would recompute an endDate past this trim
    // and silently un-trim the series.
    expect(pattern?.numberOfOccurrences).toBeNull();

    await drainAfterTasks();
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const [, , meetingForCalendar] = mockedUpdate.mock.calls[0];
    expect(meetingForCalendar.recurrencePattern.numberOfOccurrences).toBeNull();
    expect(meetingForCalendar.recurrencePattern.endDate.getTime()).toBe(pattern!.endDate!.getTime());
  });

  test("a suspended meeting's 'this' delete never rewrites its calendar event", async () => {
    // The live GCal recurrence already carries a suspension-only UNTIL trim (syncSuspend) that
    // isn't represented in RecurrencePattern at all -- a full-body rewrite from the stored
    // pattern here would silently resurrect whatever the suspension hid.
    const { meeting } = await seedRecurringMeeting(
      { status: "Suspended", googleCalendarEventIds: { AA: "live-event-id" } },
      { type: "weekly", daysOfWeek: ["Monday"], interval: 1 },
    );
    const occurrenceDate = new Date("2026-09-14T18:00:00Z");

    const response = await DELETE(new Request("http://localhost/api/delete/meeting", {
      method: "DELETE",
      body: JSON.stringify({ mid: meeting.mid, deleteOption: "this", occurrenceDate: occurrenceDate.toISOString() }),
    }));
    expect(response.status).toBe(200);

    await drainAfterTasks();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  test("'this' also rewrites the meeting's own Zoom-Room join-link event, not just the calType event", async () => {
    const { meeting } = await seedRecurringMeeting(
      {
        modeType: "Hybrid", room: "Delete Route Room", zoomRoom: "Delete Route Zoom Room",
        zoomCalendarEventId: "live-room-event-id", zoomLink: "https://zoom.us/j/deleteroutetest",
        googleCalendarEventIds: { AA: "live-event-id" },
      },
      { type: "weekly", daysOfWeek: ["Monday"], interval: 1 },
    );
    const occurrenceDate = new Date("2026-09-14T18:00:00Z"); // a Monday

    const response = await DELETE(new Request("http://localhost/api/delete/meeting", {
      method: "DELETE",
      body: JSON.stringify({ mid: meeting.mid, deleteOption: "this", occurrenceDate: occurrenceDate.toISOString() }),
    }));
    expect(response.status).toBe(200);
    await drainAfterTasks();

    // Two full-body rewrites: the calType calendar event and the room-cal event.
    expect(mockedUpdate).toHaveBeenCalledTimes(2);
    const roomCall = mockedUpdate.mock.calls.find((call) => call[1] === "live-room-event-id");
    expect(roomCall).toBeDefined();
    expect(roomCall![3]).toBe("fake-room-calendar-id");
    expect(roomCall![4]).toBe("https://zoom.us/j/deleteroutetest"); // locationOverride: the join link
    expect(roomCall![2].recurrencePattern.excludedDates).toHaveLength(1);
  });

  test("a suspended meeting's 'this' delete never rewrites its room-cal event either", async () => {
    const { meeting } = await seedRecurringMeeting(
      {
        status: "Suspended", modeType: "Hybrid", room: "Delete Route Room 2", zoomRoom: "Delete Route Zoom Room",
        zoomCalendarEventId: "live-room-event-id-2", zoomLink: "https://zoom.us/j/deleteroutetest2",
        googleCalendarEventIds: { AA: "live-event-id" },
      },
      { type: "weekly", daysOfWeek: ["Monday"], interval: 1 },
    );
    const occurrenceDate = new Date("2026-09-14T18:00:00Z");

    const response = await DELETE(new Request("http://localhost/api/delete/meeting", {
      method: "DELETE",
      body: JSON.stringify({ mid: meeting.mid, deleteOption: "this", occurrenceDate: occurrenceDate.toISOString() }),
    }));
    expect(response.status).toBe(200);
    await drainAfterTasks();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

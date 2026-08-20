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
  deleteCalendarOccurrence: jest.fn().mockResolvedValue(true),
  trimCalendarEventSeries: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/zoom", () => ({
  deleteZoomMeeting: jest.fn().mockResolvedValue(true),
  zoomRoomCalendarId: {},
}));

import { deleteCalendarEvent } from "../../services/googleCalendar";
import { deleteZoomMeeting } from "../../services/zoom";
import { DELETE } from "../../app/api/delete/meeting/route";

const mockedDelete = deleteCalendarEvent as jest.Mock;
const mockedDeleteZoom = deleteZoomMeeting as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedDelete.mockClear();
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

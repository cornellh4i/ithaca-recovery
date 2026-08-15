import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting, seedRecurringMeeting, seedSuspensionPeriod } from "../factories/meeting";

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
  deleteCalendarEvent: jest.fn().mockResolvedValue(true),
  deleteCalendarOccurrence: jest.fn().mockResolvedValue(true),
  trimCalendarEventSeries: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/zoom", () => ({
  deleteZoomMeeting: jest.fn().mockResolvedValue(true),
  zoomRoomCalendarId: {},
}));

import { deleteCalendarEvent } from "../../services/googleCalendar";
import { DELETE } from "../../app/api/delete/meeting/route";

const mockedDelete = deleteCalendarEvent as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedDelete.mockClear();
});

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 2000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result != null) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

// For asserting an absence (no further deleteCalendarEvent call lands after the expected one)
// rather than a value to poll for -- waitFor's "poll until non-null" shape doesn't apply there.
// There's no real completion signal to wait on for a negative assertion, so this is still
// fundamentally a timeout, not a true polling condition -- but 200ms is a real 4x margin over
// the 50ms blind sleep it replaces (a call landing at, say, 120ms would be missed by that sleep
// but not by this), and if a call *does* land inside the window, the quiet timer restarts, so an
// unwanted call arriving late in the window still gets caught instead of the check having
// already closed.
async function waitForStableCallCount(getCount: () => number, quietMs = 200, timeoutMs = 2000): Promise<number> {
  const start = Date.now();
  let lastCount = getCount();
  let quietSince = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const count = getCount();
    if (count !== lastCount) {
      lastCount = count;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return count;
    }
  }
  return lastCount;
}

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

  const prisma = getTestPrismaClient();
  const deleted = await waitFor(async () => {
    const m = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    return m?.deletedAt ? m : null;
  });
  expect(deleted?.deletedAt).not.toBeNull();

  await waitFor(async () => (mockedDelete.mock.calls.length >= 2 ? true : null));
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

  await waitFor(async () => (mockedDelete.mock.calls.length > 0 ? true : null));
  // A settle window after the first call -- asserting toHaveBeenCalledTimes(1) immediately upon
  // seeing the first call would pass even if a second, unwanted call was about to land right
  // after (syncDeleteAll's deletes are sequential, not concurrent).
  await waitForStableCallCount(() => mockedDelete.mock.calls.length);
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

  await waitFor(async () => (mockedDelete.mock.calls.length > 0 ? true : null));
  // Same settle window as above -- confirms the promoted row really isn't torn down a second
  // time, not just that it hadn't happened yet by the time the first call was observed.
  await waitForStableCallCount(() => mockedDelete.mock.calls.length);
  expect(mockedDelete).toHaveBeenCalledTimes(1);
});

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
  createCalendarEvent: jest.fn().mockResolvedValue("fresh-event-id"),
  deleteCalendarEvent: jest.fn().mockResolvedValue(true),
}));

import { createCalendarEvent, deleteCalendarEvent } from "../../services/googleCalendar";
import { POST } from "../../app/api/update/meeting/resume/route";

const mockedCreate = createCalendarEvent as jest.Mock;
const mockedDelete = deleteCalendarEvent as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedCreate.mockClear();
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

test("resuming an indefinitely-suspended meeting creates a fresh series and closes the open suspension", async () => {
  const { meeting } = await seedRecurringMeeting({ status: "Suspended" });
  await seedSuspensionPeriod(meeting.mid); // from: yesterday, to: null

  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();
  const updated = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
  expect(updated?.status).toBe("Active");

  const suspensions = await prisma.suspensionPeriod.findMany({ where: { mid: meeting.mid } });
  expect(suspensions).toHaveLength(1);
  expect(suspensions[0].to).not.toBeNull();

  const withEventIds = await waitFor(async () => {
    const m = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    return m?.googleCalendarEventIds ? m : null;
  });
  expect(withEventIds?.googleCalendarEventIds).toEqual({ AA: "fresh-event-id" });
  expect(mockedDelete).not.toHaveBeenCalled();
});

test("resuming early discards the pre-created future series instead of promoting it", async () => {
  const { meeting } = await seedRecurringMeeting({ status: "Suspended" });
  const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days out -- not due yet
  await seedSuspensionPeriod(meeting.mid, { to: farFuture, resumeEventIds: { AA: "pending-future-event-id" } });

  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  await waitFor(async () => (mockedDelete.mock.calls.length > 0 ? true : null));
  expect(mockedDelete).toHaveBeenCalledWith("fake-token", "pending-future-event-id", "fake-calendar-id");
  expect(mockedCreate).toHaveBeenCalled();
});

test("resuming a meeting that isn't currently suspended returns 400", async () => {
  const meeting = await seedMeeting({ status: "Active" });

  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await POST(request);
  expect(response.status).toBe(400);
});

test("cancelling a suspension scheduled for a future date (not active yet) succeeds instead of 400ing", async () => {
  const { meeting } = await seedRecurringMeeting({ status: "Suspended" });
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await seedSuspensionPeriod(meeting.mid, { from: future, to: null });

  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();
  const updated = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
  expect(updated?.status).toBe("Active");

  const suspensions = await prisma.suspensionPeriod.findMany({ where: { mid: meeting.mid } });
  expect(suspensions).toHaveLength(1);
  expect(suspensions[0].to).not.toBeNull();
});

test("a request for a nonexistent meeting returns 404", async () => {
  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: "does-not-exist" }),
  });
  const response = await POST(request);
  expect(response.status).toBe(404);
});

test("resuming with an 'on' date schedules the resume instead of reactivating immediately", async () => {
  const { meeting } = await seedRecurringMeeting(
    { status: "Suspended" },
    { daysOfWeek: ["Monday", "Wednesday", "Friday"], interval: 1 },
  );
  await seedSuspensionPeriod(meeting.mid); // indefinite, open

  const onDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid, on: onDate }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();

  // Not reactivated yet -- only scheduled.
  const stillSuspended = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
  expect(stillSuspended?.status).toBe("Suspended");

  const suspension = await waitFor(async () => {
    const rows = await prisma.suspensionPeriod.findMany({ where: { mid: meeting.mid } });
    return rows[0]?.resumeEventIds ? rows[0] : null;
  });
  expect(suspension?.resumeEventIds).toEqual({ AA: "fresh-event-id" });
  expect(suspension?.promoted).toBe(false);
  expect(mockedDelete).not.toHaveBeenCalled();
});

test("rescheduling a resume tears down the previously-pending series before creating the new one", async () => {
  const { meeting } = await seedRecurringMeeting(
    { status: "Suspended" },
    { daysOfWeek: ["Monday"], interval: 1 },
  );
  const oldOn = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  await seedSuspensionPeriod(meeting.mid, { to: oldOn, resumeEventIds: { AA: "old-pending-event-id" } });

  const newOn = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid, on: newOn }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  await waitFor(async () => (mockedDelete.mock.calls.length > 0 ? true : null));
  expect(mockedDelete).toHaveBeenCalledWith("fake-token", "old-pending-event-id", "fake-calendar-id");
  expect(mockedCreate).toHaveBeenCalled();
});

test("scheduling a resume for today or earlier returns 400", async () => {
  const { meeting } = await seedRecurringMeeting({ status: "Suspended" });
  await seedSuspensionPeriod(meeting.mid);

  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid, on: new Date().toISOString() }),
  });
  const response = await POST(request);
  expect(response.status).toBe(400);
});

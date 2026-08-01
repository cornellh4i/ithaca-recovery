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

test("a request for a nonexistent meeting returns 404", async () => {
  const request = new Request("http://localhost/api/update/meeting/resume", {
    method: "POST",
    body: JSON.stringify({ mid: "does-not-exist" }),
  });
  const response = await POST(request);
  expect(response.status).toBe(404);
});

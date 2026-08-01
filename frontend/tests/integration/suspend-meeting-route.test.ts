import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { formatETDateString, convertETToUTC } from "../../util/timeUtils";

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
  trimCalendarEventSeries: jest.fn().mockResolvedValue(true),
  createCalendarEvent: jest.fn().mockResolvedValue("resume-event-id"),
  deleteCalendarEvent: jest.fn().mockResolvedValue(true),
}));

import { trimCalendarEventSeries, createCalendarEvent, deleteCalendarEvent } from "../../services/googleCalendar";
import { POST } from "../../app/api/update/meeting/suspend/route";

const mockedTrim = trimCalendarEventSeries as jest.Mock;
const mockedCreate = createCalendarEvent as jest.Mock;
const mockedDelete = deleteCalendarEvent as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedTrim.mockClear();
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

test("suspending a recurring meeting indefinitely truncates its GCal series and records an open-ended suspension", async () => {
  const { meeting } = await seedRecurringMeeting({ googleCalendarEventIds: { AA: "existing-event-id" } });

  const request = new Request("http://localhost/api/update/meeting/suspend", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();
  const updated = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
  expect(updated?.status).toBe("Suspended");

  const suspensions = await prisma.suspensionPeriod.findMany({ where: { mid: meeting.mid } });
  expect(suspensions).toHaveLength(1);
  expect(suspensions[0].to).toBeNull();

  await waitFor(async () => (mockedTrim.mock.calls.length > 0 ? true : null));
  expect(mockedTrim).toHaveBeenCalledWith("fake-token", "existing-event-id", expect.any(String), "fake-calendar-id");
  expect(mockedCreate).not.toHaveBeenCalled();
});

test("suspending with an 'until' date pre-creates the resume series on the SuspensionPeriod row, not on Meeting.googleCalendarEventIds", async () => {
  const { meeting } = await seedRecurringMeeting(
    { googleCalendarEventIds: { AA: "existing-event-id" } },
    { daysOfWeek: ["Monday", "Wednesday", "Friday"], interval: 1 },
  );

  const etDate = formatETDateString(new Date());
  const to = new Date(new Date(convertETToUTC(`${etDate}T00:00:00`)).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const request = new Request("http://localhost/api/update/meeting/suspend", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid, to }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();

  const suspension = await waitFor(async () => {
    const rows = await prisma.suspensionPeriod.findMany({ where: { mid: meeting.mid } });
    return rows[0]?.resumeEventIds ? rows[0] : null;
  });

  expect(suspension).not.toBeNull();
  expect(suspension?.resumeEventIds).toEqual({ AA: "resume-event-id" });
  expect(suspension?.promoted).toBe(false);

  // Not promoted into the live pointer yet -- the resume date hasn't arrived.
  const updatedMeeting = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
  expect(updatedMeeting?.googleCalendarEventIds).toEqual({ AA: "existing-event-id" });
});

test("suspending a one-time (non-recurring) meeting deletes its single GCal event instead of trimming a series", async () => {
  const meeting = await seedMeeting({ googleCalendarEventIds: { AA: "one-time-event-id" } });

  const request = new Request("http://localhost/api/update/meeting/suspend", {
    method: "POST",
    body: JSON.stringify({ mid: meeting.mid }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  await waitFor(async () => (mockedDelete.mock.calls.length > 0 ? true : null));
  expect(mockedDelete).toHaveBeenCalledWith("fake-token", "one-time-event-id", "fake-calendar-id");
  expect(mockedTrim).not.toHaveBeenCalled();
});

test("a request for a nonexistent meeting returns 404", async () => {
  const request = new Request("http://localhost/api/update/meeting/suspend", {
    method: "POST",
    body: JSON.stringify({ mid: "does-not-exist" }),
  });
  const response = await POST(request);
  expect(response.status).toBe(404);
});

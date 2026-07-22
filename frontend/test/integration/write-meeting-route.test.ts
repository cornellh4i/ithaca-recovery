import { randomUUID } from "crypto";
import { Role } from "@prisma/client";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import type { IMeeting } from "../../util/models";

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
  zoomRoomCalendarId: {},
}));

import { createCalendarEvent } from "../../services/googleCalendar";
import { POST } from "../../app/api/write/meeting/route";

const mockedCreateCalendarEvent = createCalendarEvent as jest.Mock;

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

test("the response resolves before Google Calendar sync completes, which runs in the background", async () => {
  const SYNC_DELAY_MS = 300;
  mockedCreateCalendarEvent.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve("fake-event-id"), SYNC_DELAY_MS)),
  );

  const payload = buildMeetingPayload();
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
  expect(rightAfterResponse?.syncStatus).toBeNull();

  // waitUntil has no real lifecycle hook outside Vercel, but the background
  // function still runs to completion on its own — just give it time to finish.
  await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS + 100));
  const afterSync = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(afterSync?.syncStatus).toBe("synced");
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

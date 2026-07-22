import { randomUUID } from "crypto";
import { Role } from "@prisma/client";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import type { IMeeting } from "../../util/models";

// [PROVISIONAL] Documents that write/meeting/route.ts awaits Google Calendar/Zoom
// sync before responding — a slow external API directly slows down meeting
// creation for the user, with no fire-and-forget path. Update/replace this test
// if that changes.

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

test("[PROVISIONAL] the response doesn't resolve until Google Calendar sync does", async () => {
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
  expect(elapsed).toBeGreaterThanOrEqual(SYNC_DELAY_MS);

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  expect(created?.syncStatus).toBe("synced");
});

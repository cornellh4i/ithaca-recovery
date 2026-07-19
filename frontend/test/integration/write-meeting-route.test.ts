import { randomUUID } from "crypto";
import { Role } from "@prisma/client";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import type { IMeeting } from "../../util/models";

// [PROVISIONAL] Documents two current architectural facts, not tied to any
// unimplemented feature: (1) write/meeting/route.ts awaits Google Calendar/Zoom
// sync before responding — a slow external API directly slows down meeting
// creation for the user, with no fire-and-forget path; (2) every route file still
// instantiates its own `new PrismaClient()` rather than sharing one singleton.
// Both are candidates a future perf pass would want to revisit — update/replace
// this test if either changes.

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

test("[PROVISIONAL] every route file still instantiates its own PrismaClient (no shared singleton)", async () => {
  const { execSync } = await import("child_process");
  const path = await import("path");
  const output = execSync(
    "grep -rl 'new PrismaClient()' app/api --include='*.ts'",
    { cwd: path.resolve(__dirname, "../.."), encoding: "utf8" },
  );
  const filesWithOwnClient = output.trim().split("\n").filter(Boolean);
  // Today this is ~18 files. The assertion just needs "more than a couple" to
  // hold as a real signal that no singleton refactor has happened — an exact
  // count would make this test churn on every unrelated route addition.
  expect(filesWithOwnClient.length).toBeGreaterThan(5);
});

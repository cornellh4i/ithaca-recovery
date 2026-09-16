import type { Session } from "next-auth";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn(),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdForCategory: { AA: "fake-aa-cal", "Al-Anon": "fake-alanon-cal" },
  checkCalendarReachable: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/zoom", () => ({
  checkZoomReachable: jest.fn().mockResolvedValue(true),
  zoomRoomCalendarId: { "Serenity - Zoom": "fake-room-cal" },
  zoomHostPool: [],
  checkZoomHostPool: jest.fn().mockResolvedValue({}),
}));

import { requireRole } from "../../services/auth";
import { checkCalendarReachable } from "../../services/googleCalendar";
import { disconnectTestPrismaClient } from "../factories/db";
import { GET as getSystemStatus } from "../../app/api/admin/diagnostics/system-status/route";

const mockedRequireRole = jest.mocked(requireRole);
const mockedCheckCalendar = jest.mocked(checkCalendarReachable);

function sessionWith(googleAuthExpired: boolean): Session {
  return {
    user: { email: "admin@icr.test", role: "ADMIN" },
    accessToken: "fake-token",
    googleAuthExpired,
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;
}

beforeEach(() => {
  mockedCheckCalendar.mockClear();
});

afterAll(async () => {
  await disconnectTestPrismaClient();
});

test("a healthy session probes every calendar and reports the grant as live", async () => {
  mockedRequireRole.mockResolvedValue(sessionWith(false));

  const body = await (await getSystemStatus()).json();

  expect(mockedCheckCalendar).toHaveBeenCalled();
  expect(body.session.googleAuthExpired).toBe(false);
  expect(body.googleCalendar.categories).toEqual({ AA: true, "Al-Anon": true });
});

test("an expired grant skips the calendar probes instead of reporting Google unreachable", async () => {
  mockedRequireRole.mockResolvedValue(sessionWith(true));

  const body = await (await getSystemStatus()).json();

  // The panel would otherwise read "0/2 calendars reachable" off two guaranteed 401s, which
  // reads as Google being down rather than as this admin needing to reconnect.
  expect(mockedCheckCalendar).not.toHaveBeenCalled();
  expect(body.session.googleAuthExpired).toBe(true);
  expect(body.googleCalendar.categories).toEqual({ AA: false, "Al-Anon": false });
  expect(body.zoom.roomCalendars).toEqual({ "Serenity - Zoom": false });
});

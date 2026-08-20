jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "ADMIN" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/zoom", () => ({
  getZoomMeetingCredentials: jest.fn(),
}));

import { NextRequest } from "next/server";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting } from "../factories/meeting";
import { GET } from "../../app/api/admin/zoom-drift/[mid]/route";
import { requireRole } from "../../services/auth";
import { getZoomMeetingCredentials } from "../../services/zoom";

const mockedRequireRole = requireRole as jest.Mock;
const mockedGetCredentials = getZoomMeetingCredentials as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedGetCredentials.mockReset();
});

const driftRequest = (mid: string) =>
  new NextRequest(`http://localhost/api/admin/zoom-drift/${mid}`);

test("reports drift when the live Zoom passcode differs from the stored one", async () => {
  const meeting = await seedMeeting({
    zid: "70000000901", zoomLink: "http://zoom.test/j/70000000901?pwd=old", zoomPasscode: "old",
  });
  mockedGetCredentials.mockResolvedValue({ passcode: "new", joinUrl: "http://zoom.test/j/70000000901?pwd=new" });

  const response = await GET(driftRequest(meeting.mid));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ drift: true });
  expect(mockedGetCredentials).toHaveBeenCalledWith("70000000901");
});

test("a passcode-only change is drift even when the join URL is unchanged", async () => {
  const meeting = await seedMeeting({
    zid: "70000000906", zoomLink: "http://zoom.test/j/70000000906", zoomPasscode: "old",
  });
  mockedGetCredentials.mockResolvedValue({ passcode: "new", joinUrl: "http://zoom.test/j/70000000906" });

  const response = await GET(driftRequest(meeting.mid));
  expect(await response.json()).toEqual({ drift: true });
});

test("a join-URL-only change is drift even when the passcode is unchanged", async () => {
  const meeting = await seedMeeting({
    zid: "70000000907", zoomLink: "http://zoom.test/j/old-url", zoomPasscode: "same",
  });
  mockedGetCredentials.mockResolvedValue({ passcode: "same", joinUrl: "http://zoom.test/j/new-url" });

  const response = await GET(driftRequest(meeting.mid));
  expect(await response.json()).toEqual({ drift: true });
});

test("a null stored passcode against Zoom's normalized passcode-less value is not drift", async () => {
  const meeting = await seedMeeting({
    zid: "70000000908", zoomLink: "http://zoom.test/j/70000000908", zoomPasscode: "",
  });
  // getZoomMeetingCredentials normalizes Zoom's password: "" to null before it gets here.
  mockedGetCredentials.mockResolvedValue({ passcode: null, joinUrl: "http://zoom.test/j/70000000908" });

  const response = await GET(driftRequest(meeting.mid));
  expect(await response.json()).toEqual({ drift: false });
});

test("reports no drift when the live credentials match the stored copy", async () => {
  const meeting = await seedMeeting({
    zid: "70000000902", zoomLink: "http://zoom.test/j/70000000902?pwd=x", zoomPasscode: "x",
  });
  mockedGetCredentials.mockResolvedValue({ passcode: "x", joinUrl: "http://zoom.test/j/70000000902?pwd=x" });

  const response = await GET(driftRequest(meeting.mid));
  expect(await response.json()).toEqual({ drift: false });
});

test("an unreachable Zoom fetch is not drift", async () => {
  const meeting = await seedMeeting({ zid: "70000000903", zoomPasscode: "x" });
  mockedGetCredentials.mockResolvedValue(null);

  const response = await GET(driftRequest(meeting.mid));
  expect(await response.json()).toEqual({ drift: false });
});

test("a meeting with no Zoom meeting at all is never drifted, without calling Zoom", async () => {
  const meeting = await seedMeeting({ zid: null, zoomLink: null, zoomPasscode: null });

  const response = await GET(driftRequest(meeting.mid));
  expect(await response.json()).toEqual({ drift: false });
  expect(mockedGetCredentials).not.toHaveBeenCalled();
});

test("404s on an unknown meeting", async () => {
  const response = await GET(driftRequest("no-such-mid"));
  expect(response.status).toBe(404);
});

test("non-admin callers are rejected before any lookup", async () => {
  mockedRequireRole.mockResolvedValueOnce(new Response(null, { status: 403 }));
  const response = await GET(driftRequest("irrelevant"));
  expect(response.status).toBe(403);
  expect(mockedGetCredentials).not.toHaveBeenCalled();
});

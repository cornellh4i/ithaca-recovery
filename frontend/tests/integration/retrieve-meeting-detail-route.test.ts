import { NextRequest } from "next/server";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { disconnectTestPrismaClient } from "../factories/db";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";

jest.mock("../../services/auth", () => ({
  getAuth: jest.fn(),
}));

import { getAuth } from "../../services/auth";
import { GET } from "../../app/api/retrieve/meeting/[id]/route";

const mockedGetAuth = getAuth as jest.Mock;

afterAll(async () => {
  await disconnectTestPrismaClient();
});

const ADMIN_ONLY_FIELDS = ["creator", "email", "googleSyncStatus", "zoomSyncError", "zoomPasscode", "zoomInvitation"];
const PUBLIC_MEETING_FIELDS = [
  "mid", "title", "startDateTime", "endDateTime", "calType",
  "modeType", "room", "zoomRoom", "isRecurring", "recurrencePattern",
].sort();

async function getMeetingDetail(mid: string) {
  const request = new NextRequest(`http://localhost/api/retrieve/meeting/${mid}`);
  const response = await GET(request);
  return response.json();
}

test("an unauthenticated caller only gets the public-safe meeting fields", async () => {
  mockedGetAuth.mockResolvedValue(null);
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.mid).toBe(meeting.mid);
  expect(Object.keys(body).sort()).toEqual(PUBLIC_MEETING_FIELDS);
  ADMIN_ONLY_FIELDS.forEach((field) => expect(body).not.toHaveProperty(field));
});

test("a USER-role session gets the same public-safe subset as an unauthenticated caller, not the full record", async () => {
  mockedGetAuth.mockResolvedValue({ user: { role: "USER" } });
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.mid).toBe(meeting.mid);
  expect(Object.keys(body).sort()).toEqual(PUBLIC_MEETING_FIELDS);
  ADMIN_ONLY_FIELDS.forEach((field) => expect(body).not.toHaveProperty(field));
});

test("an ADMIN-role session gets the full record", async () => {
  mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.creator).toBe("Someone Private");
  expect(body.email).toBe("private@test.icr");
});

test("a SUPER_ADMIN-role session gets the full record", async () => {
  mockedGetAuth.mockResolvedValue({ user: { role: "SUPER_ADMIN" } });
  const meeting = await seedMeeting({ creator: "Someone Private", email: "private@test.icr" });

  const body = await getMeetingDetail(meeting.mid);
  expect(body.creator).toBe("Someone Private");
  expect(body.email).toBe("private@test.icr");
});

// A few legacy Zoom meetings serve two platform rows on one zid (one union schedule on Zoom).
// The sibling lookup below is what tells an admin the link is shared and whether Zoom is
// waiting on the other row to match again.
describe("shared Zoom link siblings", () => {
  const etDate = formatETDateString(new Date());
  const at = (time: string) => new Date(convertETToUTC(`${etDate}T${time}`));

  const seedSharedPair = async (zid: string, siblingTimes: { start: string; end: string }) => {
    const { meeting } = await seedRecurringMeeting(
      { zid, title: "Early Bird", modeType: "Hybrid", startDateTime: at("18:00:00"), endDateTime: at("19:00:00") },
      { daysOfWeek: ["Monday"] },
    );
    await seedRecurringMeeting(
      {
        zid, title: "One Day at a Time", modeType: "Remote",
        startDateTime: at(siblingTimes.start), endDateTime: at(siblingTimes.end),
      },
      { daysOfWeek: ["Sunday"] },
    );
    return meeting;
  };

  test("an admin sees the sibling rows, with no divergence while the schedules still match", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const meeting = await seedSharedPair("70000001101", { start: "18:00:00", end: "19:00:00" });

    const body = await getMeetingDetail(meeting.mid);
    expect(body.sharedWith).toEqual([{ title: "One Day at a Time", modeType: "Remote" }]);
    expect(body.zoomScheduleDiverged).toBe(false);
  });

  test("divergence flips true when a sibling's time-of-day no longer matches", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const meeting = await seedSharedPair("70000001102", { start: "20:00:00", end: "21:00:00" });

    const body = await getMeetingDetail(meeting.mid);
    expect(body.sharedWith).toHaveLength(1);
    expect(body.zoomScheduleDiverged).toBe(true);
  });

  test("an unshared meeting carries neither field", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const meeting = await seedMeeting({ zid: "70000001103" });

    const body = await getMeetingDetail(meeting.mid);
    expect(body).not.toHaveProperty("sharedWith");
    expect(body).not.toHaveProperty("zoomScheduleDiverged");
  });

  // BUG-022: the sibling's title/mode is admin-only -- a public viewer of a shared meeting
  // gets the same allowlisted fields as any other meeting.
  test("a public caller never gets the sibling data, even on a shared meeting", async () => {
    const meeting = await seedSharedPair("70000001104", { start: "20:00:00", end: "21:00:00" });
    mockedGetAuth.mockResolvedValue(null);

    const body = await getMeetingDetail(meeting.mid);
    expect(Object.keys(body).sort()).toEqual(PUBLIC_MEETING_FIELDS);
    expect(body).not.toHaveProperty("sharedWith");
    expect(body).not.toHaveProperty("zoomScheduleDiverged");
  });
});

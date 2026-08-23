import { NextRequest } from "next/server";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
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

  // A "This event" split-off child (isRecurring: false, splitFromMid set) has no
  // representation in Zoom's single recurring schedule at all -- it's a one-off, not a second
  // weekly slot, so it must never pin zoomScheduleDiverged to true with no way to clear.
  test("a non-recurring split-off child sibling never counts toward divergence, even with a mismatched schedule", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const zid = "70000001105";
    const { meeting } = await seedRecurringMeeting(
      { zid, title: "Early Bird", modeType: "Hybrid", startDateTime: at("18:00:00"), endDateTime: at("19:00:00") },
      { daysOfWeek: ["Monday"] },
    );
    // A detached "This event" child: non-recurring, a mismatched one-off time, and splitFromMid
    // set (as handleScopedEdit always sets it) -- exactly what would otherwise permanently flag.
    await seedMeeting({
      zid, title: "Split Occurrence", modeType: "Remote", isRecurring: false,
      splitFromMid: meeting.mid, startDateTime: at("20:00:00"), endDateTime: at("20:30:00"),
    });

    const body = await getMeetingDetail(meeting.mid);
    expect(body.sharedWith).toEqual([{ title: "Split Occurrence", modeType: "Remote" }]);
    expect(body.zoomScheduleDiverged).toBe(false);
  });

  // A "This and following" tail split is still a real recurring weekly slot -- unlike the
  // one-off case above, it must still flag if its schedule genuinely diverges from the root.
  test("a recurring tail split sibling that genuinely diverges still flags", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const zid = "70000001106";
    const { meeting } = await seedRecurringMeeting(
      { zid, title: "Early Bird", modeType: "Hybrid", startDateTime: at("18:00:00"), endDateTime: at("19:00:00") },
      { daysOfWeek: ["Monday"] },
    );
    await seedRecurringMeeting(
      {
        zid, title: "Tail Split", modeType: "Remote", splitFromMid: meeting.mid,
        startDateTime: at("20:00:00"), endDateTime: at("21:00:00"),
      },
      { daysOfWeek: ["Sunday"] },
    );

    const body = await getMeetingDetail(meeting.mid);
    expect(body.sharedWith).toEqual([{ title: "Tail Split", modeType: "Remote" }]);
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

// One meeting the group runs as two schedules (Meeting.linkedToMid) -- e.g. Hybrid on weekdays
// and Zoom-only on Saturday. Keyed on linkedToMid, never on zid: an In-Person member holds no
// zid at all, so a zid lookup would miss it entirely.
describe("linked schedules", () => {
  const seedFamily = async (
    anchorOverrides: Record<string, unknown> = {},
    linkedOverrides: Record<string, unknown> = {},
  ) => {
    const { meeting: anchor } = await seedRecurringMeeting(
      { title: "One Day at a Time", modeType: "Hybrid", room: "Serenity Room",
        zoomRoom: "Unity Room - Zoom", zoomHost: "pool-host-1@icr.test", ...anchorOverrides },
      { daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
    );
    const { meeting: linked } = await seedRecurringMeeting(
      { title: "One Day at a Time", modeType: "Remote", room: "", zoomRoom: null,
        zoomHost: "pool-host-1@icr.test", linkedToMid: anchor.mid,
        googleSyncStatus: "synced", zoomSyncStatus: "synced", ...linkedOverrides },
      { daysOfWeek: ["Saturday"] },
    );
    return { anchor, linked };
  };

  test("an admin gets the other schedule, with everything the schedule card renders", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const { anchor, linked } = await seedFamily();

    const body = await getMeetingDetail(anchor.mid);
    expect(body.linkedSchedules).toHaveLength(1);
    const [schedule] = body.linkedSchedules;
    expect(Object.keys(schedule).sort()).toEqual([
      "endDateTime", "googleSyncStatus", "mid", "modeType", "recurrencePattern", "room",
      "startDateTime", "zoomRoom", "zoomSyncStatus", "zoomHost",
    ].sort());
    expect(schedule.mid).toBe(linked.mid);
    expect(schedule.modeType).toBe("Remote");
    expect(schedule.zoomHost).toBe("pool-host-1@icr.test");
    expect(schedule.recurrencePattern.daysOfWeek).toEqual(["Saturday"]);
    expect(schedule.googleSyncStatus).toBe("synced");
    expect(new Date(schedule.startDateTime)).toEqual(linked.startDateTime);
  });

  // The family resolves from either member, so opening the Saturday row reports the weekday
  // one -- never itself.
  test("opening the linked row reports the anchor, not itself", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const { anchor, linked } = await seedFamily();

    const body = await getMeetingDetail(linked.mid);
    expect(body.linkedSchedules.map((row: { mid: string }) => row.mid)).toEqual([anchor.mid]);
    expect(body.linkedSchedules[0].modeType).toBe("Hybrid");
  });

  // The whole reason the family is keyed on linkedToMid: an In-Person schedule must never hold
  // a zid, so sharedWith (a zid question) can't see this pair at all.
  test("a Zoom-free family member is reported even though the two share no zid", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const { anchor, linked } = await seedFamily(
      { modeType: "In Person", zid: null, zoomRoom: null, zoomHost: null },
      { modeType: "Remote", zid: "70000002101", room: "" },
    );

    const body = await getMeetingDetail(anchor.mid);
    expect(body.linkedSchedules.map((row: { mid: string }) => row.mid)).toEqual([linked.mid]);
    expect(body).not.toHaveProperty("sharedWith");
  });

  // Pool exhaustion leaves a just-created Zoom-bearing member at pending/error with no calendar
  // events yet -- the card has to be able to say the schedule isn't live, so the statuses are
  // part of the payload.
  test("a member still waiting on its first sync reports its raw statuses", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const { anchor } = await seedFamily({}, { googleSyncStatus: "pending", zoomSyncStatus: "error" });

    const body = await getMeetingDetail(anchor.mid);
    expect(body.linkedSchedules[0].googleSyncStatus).toBe("pending");
    expect(body.linkedSchedules[0].zoomSyncStatus).toBe("error");
  });

  test("a soft-deleted member is no longer part of the family", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const { anchor, linked } = await seedFamily();
    await getTestPrismaClient().meeting.update({
      where: { mid: linked.mid }, data: { deletedAt: new Date() },
    });

    const body = await getMeetingDetail(anchor.mid);
    expect(body).not.toHaveProperty("linkedSchedules");
  });

  test("a single-schedule meeting carries no linkedSchedules at all", async () => {
    mockedGetAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    const meeting = await seedMeeting();

    const body = await getMeetingDetail(meeting.mid);
    expect(body).not.toHaveProperty("linkedSchedules");
  });

  // BUG-022: rooms, hosts and schedules of another row are admin-only, exactly like sharedWith.
  test("a USER-role session and a public caller both get nothing", async () => {
    const { anchor } = await seedFamily();

    mockedGetAuth.mockResolvedValue({ user: { role: "USER" } });
    const userBody = await getMeetingDetail(anchor.mid);
    expect(Object.keys(userBody).sort()).toEqual(PUBLIC_MEETING_FIELDS);
    expect(userBody).not.toHaveProperty("linkedSchedules");

    mockedGetAuth.mockResolvedValue(null);
    const publicBody = await getMeetingDetail(anchor.mid);
    expect(publicBody).not.toHaveProperty("linkedSchedules");
  });
});

import { randomUUID } from "crypto";
import { formatETDateString, formatETWeekdayLong, getETTimeOfDay } from "../../util/date/timeUtils";
import { buildLinkedScheduleLabel } from "../../util/meetings/linkedSchedules";

// after() tasks are collected rather than discarded, so each test can drain them at a known
// point -- creating a meeting with two schedules fans one deferred sync out across BOTH rows,
// and the assertions are about what that sync was handed, not just that it eventually ran.
const mockCapturedAfterTasks: Promise<unknown>[] = [];
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (task: unknown) => {
    mockCapturedAfterTasks.push(Promise.resolve(typeof task === "function" ? (task as () => unknown)() : task));
  },
}));

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "ADMIN", email: "session-admin@test.icr" },
    accessToken: "fake-token",
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdsForMeeting: jest.fn((calType: string[]) =>
    Object.fromEntries(calType.map((cat) => [cat, `cal-${cat}`]))),
  createCalendarEvent: jest.fn().mockResolvedValue({ id: `event-${Math.random()}`, error: null }),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  getZoomMeetingInvitation: jest.fn().mockResolvedValue("family invitation"),
  resolveZoomHost: jest.fn(),
  getZoomHostCapacities: jest.fn().mockResolvedValue({}),
  // The route locks every pool host through the real lockResourceClaims before resolving one,
  // so these need to be real strings even though resolveZoomHost itself is mocked.
  zoomHostPool: ["create-pool-host-1@icr.test", "create-pool-host-2@icr.test"],
  // Left empty on purpose: every test here gives its rows a unique zoomRoom (so the room
  // conflict check can't make tests order-dependent), and an unmapped zoomRoom publishes no
  // Zoom-Room calendar event.
  zoomRoomCalendarId: {},
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedMeeting } from "../factories/meeting";
import { POST } from "../../app/api/write/meeting/route";
import { createCalendarEvent } from "../../services/googleCalendar";
import { createZoomMeeting, resolveZoomHost } from "../../services/zoom";

const mockedCreateCalendarEvent = createCalendarEvent as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedResolveZoomHost = resolveZoomHost as jest.Mock;

// A real future Monday at 2 PM ET, so both schedules' weekdays are derived from one date rather
// than hardcoded names that could drift apart.
const SERIES_START = new Date("2026-09-07T18:00:00Z");
const SERIES_END = new Date("2026-09-07T19:00:00Z");
const PRIMARY_WEEKDAY = formatETWeekdayLong(SERIES_START); // Monday
const LINKED_WEEKDAY = "Saturday";
const FIRST_LINKED_ET_DATE = "2026-09-12"; // the first Saturday on/after the series start

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedCreateCalendarEvent.mockClear();
  mockedCreateCalendarEvent.mockResolvedValue({ id: `event-${randomUUID()}`, error: null });
  mockedCreateZoomMeeting.mockReset();
  mockedResolveZoomHost.mockReset();
  mockCapturedAfterTasks.length = 0;
});

async function drainAfterTasks(): Promise<void> {
  await Promise.all(mockCapturedAfterTasks.splice(0, mockCapturedAfterTasks.length));
}

function postMeeting(payload: Record<string, unknown>): Promise<Response> {
  return POST(new Request("http://localhost/api/write/meeting", { method: "POST", body: JSON.stringify(payload) }));
}

// The integration database is reset once per file, not per test, and a weekly interval-1 series
// recurs forever -- so every payload gets its own room/zoomRoom unless a test is deliberately
// about sharing one.
function meetingPayload(overrides: Record<string, unknown> = {}) {
  return {
    mid: `primary-${randomUUID()}`,
    title: "Linked Create",
    description: "A meeting with two schedules",
    creator: "Spoofed Creator",
    group: "Group",
    startDateTime: SERIES_START,
    endDateTime: SERIES_END,
    email: "linked-create@test.icr",
    calType: ["AA"],
    modeType: "Hybrid",
    room: `Primary Room ${randomUUID()}`,
    zoomRoom: `Primary Zoom Room ${randomUUID()}`,
    status: "Active",
    isRecurring: true,
    recurrencePattern: {
      type: "weekly",
      startDate: SERIES_START,
      daysOfWeek: [PRIMARY_WEEKDAY],
      firstDayOfWeek: "Sunday",
      interval: 1,
    },
    ...overrides,
  };
}

function linkedBlock(overrides: Record<string, unknown> = {}) {
  return {
    mid: `linked-${randomUUID()}`,
    modeType: "Remote",
    room: null,
    zoomRoom: null,
    recurrencePattern: {
      type: "weekly",
      startDate: SERIES_START,
      daysOfWeek: [LINKED_WEEKDAY],
      firstDayOfWeek: "Sunday",
      interval: 1,
    },
    ...overrides,
  };
}

describe("linked-schedule rejections", () => {
  test("a non-recurring meeting is rejected with 400", async () => {
    const response = await postMeeting(meetingPayload({
      isRecurring: false,
      recurrencePattern: null,
      linkedSchedule: linkedBlock(),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/recurring/i);
  });

  test("a non-weekly (monthly) meeting is rejected with 400", async () => {
    const response = await postMeeting(meetingPayload({
      recurrencePattern: {
        type: "monthly", startDate: SERIES_START, daysOfWeek: [PRIMARY_WEEKDAY],
        firstDayOfWeek: "Sunday", interval: 1, weekOfMonth: 1,
      },
      linkedSchedule: linkedBlock(),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/weekly/i);
  });

  test("a linked schedule in the meeting's own mode is rejected with 400", async () => {
    const response = await postMeeting(meetingPayload({
      linkedSchedule: linkedBlock({ modeType: "Hybrid", room: "Another Room", zoomRoom: "Another Zoom Room" }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/mode this meeting doesn't already run/i);
  });

  test("weekdays the meeting already meets on are rejected with 400", async () => {
    const response = await postMeeting(meetingPayload({
      linkedSchedule: linkedBlock({ recurrencePattern: {
        type: "weekly", startDate: SERIES_START, daysOfWeek: [PRIMARY_WEEKDAY, LINKED_WEEKDAY],
        firstDayOfWeek: "Sunday", interval: 1,
      } }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(new RegExp(`already meets on ${PRIMARY_WEEKDAY}`, "i"));
  });

  test("a linked schedule with no weekday at all is rejected with 400", async () => {
    const response = await postMeeting(meetingPayload({
      linkedSchedule: linkedBlock({ recurrencePattern: {
        type: "weekly", startDate: SERIES_START, daysOfWeek: [],
        firstDayOfWeek: "Sunday", interval: 1,
      } }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at least one day/i);
  });

  test("a monthly linked schedule is rejected by the schema with 400", async () => {
    const response = await postMeeting(meetingPayload({
      linkedSchedule: linkedBlock({ recurrencePattern: {
        type: "monthly", startDate: SERIES_START, daysOfWeek: [LINKED_WEEKDAY],
        firstDayOfWeek: "Sunday", interval: 1, weekOfMonth: 1,
      } }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid linked schedule");
  });

  test("a Hybrid linked schedule with no room is rejected by the schema with 400", async () => {
    const response = await postMeeting(meetingPayload({
      modeType: "Remote", room: "", zoomRoom: null,
      linkedSchedule: linkedBlock({ modeType: "Hybrid", room: null, zoomRoom: null }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid linked schedule");
  });

  test("nothing is written when the linked schedule is rejected", async () => {
    const payload = meetingPayload({ linkedSchedule: linkedBlock({ modeType: "Hybrid", room: "R", zoomRoom: "ZR" }) });
    expect((await postMeeting(payload)).status).toBe(400);

    const prisma = getTestPrismaClient();
    expect(await prisma.meeting.findUnique({ where: { mid: payload.mid } })).toBeNull();
  });
});

test("a Hybrid meeting and its Remote linked schedule are created together, sharing one Zoom meeting", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({
    zid: "family-zid", zoomLink: "https://zoom.us/j/family", zoomPasscode: "family-pass",
  });
  const linked = linkedBlock();
  const payload = meetingPayload({ linkedSchedule: linked });

  const response = await postMeeting(payload);
  expect(response.status).toBe(201);
  expect((await response.json()).linkedMid).toBe(linked.mid);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const primary = await prisma.meeting.findUnique({ where: { mid: payload.mid }, include: { recurrencePattern: true } });
  const created = await prisma.meeting.findUnique({ where: { mid: linked.mid }, include: { recurrencePattern: true } });

  // The linked row is a second schedule of the same meeting, not a division of its series.
  expect(created?.linkedToMid).toBe(payload.mid);
  expect(created?.splitFromMid).toBeNull();
  expect(created?.status).toBe("Active");
  expect(created?.isRecurring).toBe(true);
  expect(created?.modeType).toBe("Remote");

  // Identity and content are the family's, copied from the primary schedule.
  expect(created?.title).toBe(primary?.title);
  expect(created?.description).toBe(primary?.description);
  expect(created?.email).toBe(primary?.email);
  expect(created?.group).toBe(primary?.group);
  expect(created?.calType).toEqual(primary?.calType);
  expect(created?.creator).toBe("session-admin@test.icr");

  // Re-anchored onto the first Saturday of the primary schedule's series, keeping its ET time of
  // day and its duration -- one Zoom meeting can only hold one time of day.
  expect(formatETDateString(created!.startDateTime)).toBe(FIRST_LINKED_ET_DATE);
  expect(getETTimeOfDay(created!.startDateTime)).toEqual(getETTimeOfDay(primary!.startDateTime));
  expect(created!.endDateTime.getTime() - created!.startDateTime.getTime())
    .toBe(primary!.endDateTime.getTime() - primary!.startDateTime.getTime());
  expect(created?.recurrencePattern?.daysOfWeek).toEqual([LINKED_WEEKDAY]);
  expect(created?.recurrencePattern?.interval).toBe(1);

  // ONE Zoom meeting for the whole family, minted from the primary schedule and handed both
  // rows so its recurrence is their union from the very first write.
  expect(mockedCreateZoomMeeting).toHaveBeenCalledTimes(1);
  const [mintedFrom, mintedHost, zoomFamily] = mockedCreateZoomMeeting.mock.calls[0];
  expect(mintedFrom.mid).toBe(payload.mid);
  expect(mintedHost).toBe("create-pool-host-1@icr.test");
  expect((zoomFamily as { mid: string }[]).map((row) => row.mid).sort()).toEqual([payload.mid, linked.mid].sort());

  // ...and its identity is fanned out to every Zoom-bearing row, not just the one it was minted
  // from -- a row without the zid would look unprovisioned and mint a second meeting on retry.
  for (const row of [primary, created]) {
    expect(row?.zid).toBe("family-zid");
    expect(row?.zoomLink).toBe("https://zoom.us/j/family");
    expect(row?.zoomPasscode).toBe("family-pass");
    expect(row?.zoomInvitation).toBe("family invitation");
    expect(row?.zoomHost).toBe("create-pool-host-1@icr.test");
    expect(row?.zoomSyncStatus).toBe("synced");
    expect(row?.googleSyncStatus).toBe("synced");
  }
});

test("the family's host is reserved once, against both schedules' days together", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: `zid-${randomUUID()}`, zoomLink: "https://zoom.us/j/once", zoomPasscode: null });
  const payload = meetingPayload({ linkedSchedule: linkedBlock() });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  // One reservation for one Zoom booking: resolving per schedule would charge the pool twice for
  // a meeting Zoom only ever sees once.
  expect(mockedResolveZoomHost).toHaveBeenCalledTimes(1);
  const [hostCandidate] = mockedResolveZoomHost.mock.calls[0];
  // ...and that one reservation covers everything the booking has to serve: the union of the
  // Zoom-bearing schedules' weekdays.
  expect([...hostCandidate.recurrencePattern.daysOfWeek].sort())
    .toEqual([PRIMARY_WEEKDAY, LINKED_WEEKDAY].sort());
});

test("a manually-picked host busy on the LINKED schedule's day is a 409 that writes neither row", async () => {
  const contestedHost = `contested-${randomUUID()}@icr.test`;
  // A booking of that host on the linked schedule's very first Saturday -- a day the primary
  // schedule never meets on, so only a host check over the family's union can see it.
  await seedMeeting({
    zoomHost: contestedHost,
    modeType: "Remote",
    room: "",
    zid: `zid-busy-${randomUUID()}`,
    startDateTime: new Date(`${FIRST_LINKED_ET_DATE}T18:00:00Z`),
    endDateTime: new Date(`${FIRST_LINKED_ET_DATE}T19:00:00Z`),
  });
  const linked = linkedBlock();
  const payload = meetingPayload({ zoomHost: contestedHost, linkedSchedule: linked });

  const response = await postMeeting(payload);
  expect(response.status).toBe(409);
  expect((await response.json()).conflicts).toBeDefined();

  const prisma = getTestPrismaClient();
  expect(await prisma.meeting.findUnique({ where: { mid: payload.mid } })).toBeNull();
  expect(await prisma.meeting.findUnique({ where: { mid: linked.mid } })).toBeNull();
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
});

test("a room conflict on the linked schedule's own room is a 409 that writes neither row", async () => {
  const contestedRoom = `Contested Linked Room ${randomUUID()}`;
  await seedMeeting({
    room: contestedRoom,
    startDateTime: new Date(`${FIRST_LINKED_ET_DATE}T18:00:00Z`),
    endDateTime: new Date(`${FIRST_LINKED_ET_DATE}T19:00:00Z`),
  });
  const linked = linkedBlock({ modeType: "In Person", room: contestedRoom });
  const payload = meetingPayload({ linkedSchedule: linked });

  const response = await postMeeting(payload);
  expect(response.status).toBe(409);

  const prisma = getTestPrismaClient();
  expect(await prisma.meeting.findUnique({ where: { mid: payload.mid } })).toBeNull();
  expect(await prisma.meeting.findUnique({ where: { mid: linked.mid } })).toBeNull();

  // ...and confirmOverride retries the whole two-row create.
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: `zid-${randomUUID()}`, zoomLink: "https://zoom.us/j/override", zoomPasscode: null });
  const retried = await postMeeting({ ...payload, confirmOverride: true });
  expect(retried.status).toBe(201);
  expect((await prisma.meeting.findUnique({ where: { mid: linked.mid } }))?.linkedToMid).toBe(payload.mid);
  await drainAfterTasks();
});

test("both schedules' calendar events are born with the family's union title", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: `zid-${randomUUID()}`, zoomLink: "https://zoom.us/j/title", zoomPasscode: null });
  const linked = linkedBlock();
  const payload = meetingPayload({ linkedSchedule: linked });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  // buildEventTitle names an event with exactly this call, so asserting on the arguments each
  // publish was handed is asserting on the title Google receives.
  for (const mid of [payload.mid, linked.mid]) {
    const call = mockedCreateCalendarEvent.mock.calls.find(([, meetingArg]) => meetingArg.mid === mid);
    expect(call).toBeDefined();
    const [, meetingArg, calId, , family] = call!;
    expect(calId).toBe("cal-AA");
    expect(buildLinkedScheduleLabel(meetingArg.title, meetingArg, family))
      .toBe("Linked Create - Hybrid Mon - Zoom Only Sat");
  }
});

test("an In-Person linked schedule inherits no Zoom identity at all", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: "hybrid-only-zid", zoomLink: "https://zoom.us/j/hybridonly", zoomPasscode: null });
  const linked = linkedBlock({ modeType: "In Person", room: `In Person Room ${randomUUID()}`, zoomRoom: null });
  const payload = meetingPayload({ linkedSchedule: linked });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linked.mid } });
  expect(created?.linkedToMid).toBe(payload.mid);
  expect(created?.zid).toBeNull();
  expect(created?.zoomLink).toBeNull();
  expect(created?.zoomPasscode).toBeNull();
  expect(created?.zoomInvitation).toBeNull();
  expect(created?.zoomHost).toBeNull();
  // Its own calendar events still publish -- an in-person schedule needs no Zoom meeting.
  expect(created?.googleSyncStatus).toBe("synced");

  // Still one Zoom meeting, minted from the Hybrid schedule, and the In-Person row is part of
  // the family it is named after even though it holds no zid.
  expect(mockedCreateZoomMeeting).toHaveBeenCalledTimes(1);
  const [mintedFrom, , zoomFamily] = mockedCreateZoomMeeting.mock.calls[0];
  expect(mintedFrom.mid).toBe(payload.mid);
  expect((zoomFamily as { mid: string }[]).map((row) => row.mid).sort()).toEqual([payload.mid, linked.mid].sort());

  // The host is reserved for the Hybrid schedule's days alone -- the In-Person schedule's
  // weekdays never reach Zoom's recurrence, so they must not charge the pool either.
  const [hostCandidate] = mockedResolveZoomHost.mock.calls[0];
  expect(hostCandidate.recurrencePattern.daysOfWeek).toEqual([PRIMARY_WEEKDAY]);
});

test("an In-Person meeting with a Remote linked schedule: the linked row holds the family's Zoom identity", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-2@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: "linked-held-zid", zoomLink: "https://zoom.us/j/linkedheld", zoomPasscode: null });
  const linked = linkedBlock();
  const payload = meetingPayload({
    modeType: "In Person",
    room: `In Person Primary ${randomUUID()}`,
    zoomRoom: null,
    linkedSchedule: linked,
  });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const primary = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  const created = await prisma.meeting.findUnique({ where: { mid: linked.mid } });

  // There is no Zoom meeting on the in-person schedule to inherit, so the linked schedule mints
  // the family's and becomes its zid holder -- linkedToMid still keys the family, which is
  // exactly why the family isn't keyed on zid.
  expect(mockedCreateZoomMeeting).toHaveBeenCalledTimes(1);
  const [mintedFrom] = mockedCreateZoomMeeting.mock.calls[0];
  expect(mintedFrom.mid).toBe(linked.mid);
  expect(created?.zid).toBe("linked-held-zid");
  expect(created?.zoomHost).toBe("create-pool-host-2@icr.test");
  expect(primary?.zid).toBeNull();
  expect(primary?.zoomHost).toBeNull();
  expect(created?.linkedToMid).toBe(payload.mid);

  // The reservation covers the schedule that actually meets online.
  const [hostCandidate] = mockedResolveZoomHost.mock.calls[0];
  expect(hostCandidate.recurrencePattern.daysOfWeek).toEqual([LINKED_WEEKDAY]);
});

test("an exhausted host pool leaves BOTH schedules unpublished rather than half-published", async () => {
  mockedResolveZoomHost.mockResolvedValue(null);
  const linked = linkedBlock();
  const payload = meetingPayload({ linkedSchedule: linked });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
  const prisma = getTestPrismaClient();
  for (const mid of [payload.mid, linked.mid]) {
    const row = await prisma.meeting.findUnique({ where: { mid } });
    expect(row?.zoomSyncStatus).toBe("error");
    expect(row?.zoomSyncError).toMatch(/pool exhausted/i);
    // Nothing is published with a missing join link; "Retry sync" picks both rows back up once a
    // host frees up.
    expect(row?.googleSyncStatus).toBe("pending");
  }
  expect(mockedCreateCalendarEvent).not.toHaveBeenCalled();
});

test("an In-Person primary schedule holds no client-supplied Zoom identity", async () => {
  const linked = linkedBlock();
  const payload = meetingPayload({
    modeType: "In Person",
    room: `In Person Adopting ${randomUUID()}`,
    zoomRoom: null,
    // The whole Zoom identity of an adopted meeting, supplied by the client for a schedule that
    // never meets online.
    zid: "adopted-zid",
    zoomLink: "https://zoom.us/j/adopted",
    zoomPasscode: "adopted-pass",
    zoomInvitation: "adopted invitation",
    linkedSchedule: linked,
  });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const primary = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  const created = await prisma.meeting.findUnique({ where: { mid: linked.mid } });

  // Every Zoom field, not just the host: a row holding a zid/zoomLink would advertise a join
  // link on its calendar event and union its weekdays into the family's Zoom recurrence.
  expect(primary?.zid).toBeNull();
  expect(primary?.zoomLink).toBeNull();
  expect(primary?.zoomPasscode).toBeNull();
  expect(primary?.zoomInvitation).toBeNull();
  expect(primary?.zoomHost).toBeNull();
  // The Remote schedule is where the adopted Zoom meeting actually lives.
  expect(created?.zid).toBe("adopted-zid");
  expect(created?.zoomLink).toBe("https://zoom.us/j/adopted");

  // ...and the in-person schedule's calendar event is published with no join link either --
  // buildEventBody writes "Zoom: {link}" from exactly this argument.
  const primaryCall = mockedCreateCalendarEvent.mock.calls.find(([, meetingArg]) => meetingArg.mid === payload.mid);
  expect(primaryCall).toBeDefined();
  expect(primaryCall![1].zid).toBeNull();
  expect(primaryCall![1].zoomLink).toBeNull();
  // The payload already carried a Zoom meeting, so none is minted for the family.
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
});

test("a deferred sync that throws on the second schedule leaves the first schedule's synced status standing", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: `zid-${randomUUID()}`, zoomLink: "https://zoom.us/j/throws", zoomPasscode: null });
  const linked = linkedBlock();
  const payload = meetingPayload({ linkedSchedule: linked });
  // A throw, not a handled publish failure: the linked row's publish takes down the whole
  // deferred sync after the primary row has already committed its own success.
  mockedCreateCalendarEvent.mockImplementation(async (_token: string, meetingArg: { mid: string }) => {
    if (meetingArg.mid === linked.mid) throw new Error("calendar publish exploded");
    return { id: `event-${randomUUID()}`, error: null };
  });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const primary = await prisma.meeting.findUnique({ where: { mid: payload.mid } });
  const created = await prisma.meeting.findUnique({ where: { mid: linked.mid } });

  // The primary schedule's events are live on Google -- the catch-all must not flip it to error.
  expect(primary?.googleSyncStatus).toBe("synced");
  expect(primary?.googleSyncError).toBeNull();
  expect(created?.googleSyncStatus).toBe("error");
  expect(created?.googleSyncError).toBe("Sync job failed unexpectedly.");
});

test("the linked schedule's own series is derived, never taken from the client", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: `zid-${randomUUID()}`, zoomLink: "https://zoom.us/j/derived", zoomPasscode: null });
  const linked = linkedBlock({
    recurrencePattern: {
      type: "weekly",
      // Every one of these is the client trying to define the family's shape: a different start,
      // a different cadence, and an end of its own.
      startDate: new Date("2027-01-02T05:00:00Z"),
      endDate: new Date("2027-03-01T05:00:00Z"),
      numberOfOccurrences: 3,
      daysOfWeek: [LINKED_WEEKDAY],
      firstDayOfWeek: "Sunday",
      interval: 4,
    },
  });
  const payload = meetingPayload({ linkedSchedule: linked });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linked.mid }, include: { recurrencePattern: true } });
  expect(created?.recurrencePattern?.interval).toBe(1);
  expect(created?.recurrencePattern?.endDate).toBeNull();
  expect(created?.recurrencePattern?.numberOfOccurrences).toBeNull();
  expect(formatETDateString(created!.recurrencePattern!.startDate)).toBe(FIRST_LINKED_ET_DATE);
});

test("a count-bounded meeting gives its linked schedule the same count, resolved into its own end date", async () => {
  mockedResolveZoomHost.mockResolvedValue("create-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValue({ zid: `zid-${randomUUID()}`, zoomLink: "https://zoom.us/j/counted", zoomPasscode: null });
  const linked = linkedBlock();
  const payload = meetingPayload({
    recurrencePattern: {
      type: "weekly", startDate: SERIES_START, daysOfWeek: [PRIMARY_WEEKDAY],
      firstDayOfWeek: "Sunday", interval: 1, numberOfOccurrences: 3,
    },
    linkedSchedule: linked,
  });

  expect((await postMeeting(payload)).status).toBe(201);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linked.mid }, include: { recurrencePattern: true } });
  // Three Saturdays from its own first one, not the primary schedule's three Mondays.
  expect(created?.recurrencePattern?.numberOfOccurrences).toBe(3);
  expect(formatETDateString(created!.recurrencePattern!.startDate)).toBe(FIRST_LINKED_ET_DATE);
  expect(formatETDateString(created!.recurrencePattern!.endDate!)).toBe("2026-09-26");
});

import { randomUUID } from "crypto";
import type { Meeting } from "@prisma/client";
import { formatETDateString, formatETWeekdayLong, getETTimeOfDay } from "../../util/date/timeUtils";
import { buildLinkedScheduleLabel } from "../../util/meetings/linkedSchedules";

// after() tasks are collected rather than discarded (the shim update-meeting-scoped-edit.test.ts
// uses) so each test can drain them at a known point -- a linked-schedule create fans work out to
// BOTH the new row and every existing family member, and the assertions are about what those two
// syncs were handed, not just that they eventually ran.
const mockCapturedAfterTasks: Promise<unknown>[] = [];
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (task: unknown) => {
    mockCapturedAfterTasks.push(Promise.resolve(task));
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
  updateCalendarEvent: jest.fn().mockResolvedValue({ ok: true, error: null }),
  deleteCalendarEvent: jest.fn().mockResolvedValue(true),
  reconcileMeetingCalendars: jest.fn().mockResolvedValue({ updatedEventIds: {}, allSynced: true, googleSyncError: null }),
}));

jest.mock("../../services/zoom", () => ({
  createZoomMeeting: jest.fn(),
  updateZoomMeeting: jest.fn().mockResolvedValue(true),
  rehostZoomMeeting: jest.fn(),
  deleteZoomMeeting: jest.fn(),
  getZoomMeetingInvitation: jest.fn().mockResolvedValue(null),
  resolveZoomHost: jest.fn(),
  getZoomHostCapacities: jest.fn().mockResolvedValue({}),
  zoomHostPool: ["linked-pool-host-1@icr.test", "linked-pool-host-2@icr.test"],
  zoomRoomCalendarId: { "Linked Zoom Room": "linked-zoomroom-cal-id" },
}));

import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { seedRecurringMeeting, seedMeeting } from "../factories/meeting";
import { PUT } from "../../app/api/update/meeting/route";
import { createCalendarEvent, updateCalendarEvent } from "../../services/googleCalendar";
import { createZoomMeeting, updateZoomMeeting, resolveZoomHost } from "../../services/zoom";

const mockedCreateCalendarEvent = createCalendarEvent as jest.Mock;
const mockedUpdateCalendarEvent = updateCalendarEvent as jest.Mock;
const mockedCreateZoomMeeting = createZoomMeeting as jest.Mock;
const mockedUpdateZoomMeeting = updateZoomMeeting as jest.Mock;
const mockedResolveZoomHost = resolveZoomHost as jest.Mock;

// A real future Monday, so the anchor's weekday and the linked schedule's Saturday are both
// derived from the anchor date instead of being hardcoded names that could drift apart.
const SERIES_START = new Date("2026-09-07T18:00:00Z");
const SERIES_END = new Date("2026-09-07T19:00:00Z");
const ANCHOR_WEEKDAY = formatETWeekdayLong(SERIES_START); // Monday
const LINKED_WEEKDAY = "Saturday";
const FIRST_LINKED_ET_DATE = "2026-09-12"; // the first Saturday on/after the anchor's start

afterAll(async () => {
  await disconnectTestPrismaClient();
});

beforeEach(() => {
  mockedCreateCalendarEvent.mockClear();
  mockedUpdateCalendarEvent.mockClear();
  mockedCreateZoomMeeting.mockClear();
  mockedUpdateZoomMeeting.mockClear();
  mockedResolveZoomHost.mockClear();
  mockCapturedAfterTasks.length = 0;
});

async function drainAfterTasks(): Promise<void> {
  await Promise.all(mockCapturedAfterTasks.splice(0, mockCapturedAfterTasks.length));
}

function putMeeting(payload: Record<string, unknown>): Promise<Response> {
  return PUT(new Request("http://localhost/api/update/meeting", { method: "PUT", body: JSON.stringify(payload) }));
}

// The integration DB is reset once per file (globalSetup), not per test, and a weekly interval-1
// series recurs forever -- so every anchor gets its own room/zid/host unless a test is
// deliberately about sharing one.
async function seedAnchor(overrides: Record<string, unknown> = {}, patternOverrides: Record<string, unknown> = {}) {
  const { meeting } = await seedRecurringMeeting(
    {
      title: "Linked Family",
      startDateTime: SERIES_START,
      endDateTime: SERIES_END,
      modeType: "Hybrid",
      room: `Linked Room ${randomUUID()}`,
      zoomRoom: "Linked Zoom Room",
      zid: randomUUID(),
      zoomLink: "https://zoom.us/j/anchor",
      zoomPasscode: "anchor-pass",
      zoomInvitation: "anchor invitation",
      zoomHost: `linked-${randomUUID()}@518icr.com`,
      zoomManaged: true,
      zoomTopic: null,
      calType: ["AA"],
      googleCalendarEventIds: { AA: "anchor-event-aa" },
      ...overrides,
    },
    { type: "weekly", daysOfWeek: [ANCHOR_WEEKDAY], interval: 1, ...patternOverrides },
  );
  return meeting;
}

function anchorPayload(anchor: Meeting, extra: Record<string, unknown> = {}) {
  return {
    mid: anchor.mid,
    title: anchor.title,
    description: anchor.description,
    creator: anchor.creator,
    group: anchor.group,
    startDateTime: anchor.startDateTime,
    endDateTime: anchor.endDateTime,
    email: anchor.email,
    calType: anchor.calType,
    modeType: anchor.modeType,
    room: anchor.room,
    zoomRoom: anchor.zoomRoom,
    status: anchor.status,
    isRecurring: anchor.isRecurring,
    ...extra,
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
    const anchor = await seedMeeting({ modeType: "Remote", room: "", zoomRoom: null });
    const response = await putMeeting(anchorPayload(anchor, { linkedSchedule: linkedBlock() }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/recurring/i);
  });

  test("a non-weekly (monthly) meeting is rejected with 400", async () => {
    const anchor = await seedAnchor({}, { type: "monthly", daysOfWeek: [ANCHOR_WEEKDAY], weekOfMonth: 1 });
    const response = await putMeeting(anchorPayload(anchor, { linkedSchedule: linkedBlock() }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/weekly/i);
  });

  test("a family already at the cap of 2 is rejected with 400", async () => {
    const anchor = await seedAnchor();
    await seedRecurringMeeting(
      { linkedToMid: anchor.mid, modeType: "Remote", room: "", zoomRoom: null, zid: anchor.zid,
        startDateTime: SERIES_START, endDateTime: SERIES_END },
      { type: "weekly", daysOfWeek: [LINKED_WEEKDAY], interval: 1 },
    );

    const response = await putMeeting(anchorPayload(anchor, {
      linkedSchedule: linkedBlock({ modeType: "In Person", room: "Some Room", recurrencePattern: {
        type: "weekly", startDate: SERIES_START, daysOfWeek: ["Sunday"], firstDayOfWeek: "Sunday", interval: 1,
      } }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/already runs 2 schedules/i);
  });

  test("a mode the meeting already runs is rejected with 400", async () => {
    const anchor = await seedAnchor();
    const response = await putMeeting(anchorPayload(anchor, {
      linkedSchedule: linkedBlock({ modeType: "Hybrid", room: "Another Room", zoomRoom: "Linked Zoom Room" }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/mode this meeting doesn't already run/i);
  });

  test("weekdays the meeting already meets on are rejected with 400", async () => {
    const anchor = await seedAnchor();
    const response = await putMeeting(anchorPayload(anchor, {
      linkedSchedule: linkedBlock({ recurrencePattern: {
        type: "weekly", startDate: SERIES_START, daysOfWeek: [ANCHOR_WEEKDAY, LINKED_WEEKDAY],
        firstDayOfWeek: "Sunday", interval: 1,
      } }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(new RegExp(`already meets on ${ANCHOR_WEEKDAY}`, "i"));
  });

  test("a linked schedule with no weekday at all is rejected with 400", async () => {
    const anchor = await seedAnchor();
    const response = await putMeeting(anchorPayload(anchor, {
      linkedSchedule: linkedBlock({ recurrencePattern: {
        type: "weekly", startDate: SERIES_START, daysOfWeek: [], firstDayOfWeek: "Sunday", interval: 1,
      } }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at least one day/i);
  });

  test("a Hybrid linked schedule with no room is rejected by the schema with 400", async () => {
    const anchor = await seedAnchor({ modeType: "Remote", room: "", zoomRoom: null });
    const response = await putMeeting(anchorPayload(anchor, {
      linkedSchedule: linkedBlock({ modeType: "Hybrid", room: null, zoomRoom: null }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid linked schedule");
  });

  test.each(["this", "thisAndFollowing"])(
    "a linked schedule combined with editScope '%s' is rejected with 400",
    async (editScope) => {
      const anchor = await seedAnchor();
      const response = await putMeeting(anchorPayload(anchor, {
        editScope,
        occurrenceDate: SERIES_START,
        linkedSchedule: linkedBlock(),
      }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/whole series/i);
    },
  );
});

test("a room conflict on the linked schedule's own days is a 409 that writes nothing, and confirmOverride retries it", async () => {
  const anchor = await seedAnchor();
  const contestedRoom = `Contested Linked Room ${randomUUID()}`;
  // A one-time booking of the room on the linked schedule's very first Saturday.
  await seedMeeting({
    room: contestedRoom,
    startDateTime: new Date(`${FIRST_LINKED_ET_DATE}T18:00:00Z`),
    endDateTime: new Date(`${FIRST_LINKED_ET_DATE}T19:00:00Z`),
  });

  const linkedMid = `linked-${randomUUID()}`;
  const blocked = await putMeeting(anchorPayload(anchor, {
    linkedSchedule: linkedBlock({ mid: linkedMid, modeType: "In Person", room: contestedRoom }),
  }));
  expect(blocked.status).toBe(409);
  expect((await blocked.json()).conflicts).toBeDefined();

  // The whole create is one transaction: an aborted attempt leaves no row behind.
  const prisma = getTestPrismaClient();
  expect(await prisma.meeting.findUnique({ where: { mid: linkedMid } })).toBeNull();

  const overridden = await putMeeting(anchorPayload(anchor, {
    confirmOverride: true,
    linkedSchedule: linkedBlock({ mid: linkedMid, modeType: "In Person", room: contestedRoom }),
  }));
  expect(overridden.status).toBe(200);
  const created = await prisma.meeting.findUnique({ where: { mid: linkedMid }, include: { recurrencePattern: true } });
  expect(created?.linkedToMid).toBe(anchor.mid);
  await drainAfterTasks();
});

test("a Remote schedule linked to a Hybrid anchor inherits the family's Zoom identity and derives its own schedule", async () => {
  const anchor = await seedAnchor();
  const linkedMid = `linked-${randomUUID()}`;

  const response = await putMeeting(anchorPayload(anchor, { linkedSchedule: linkedBlock({ mid: linkedMid }) }));
  expect(response.status).toBe(200);
  expect((await response.json()).linkedMid).toBe(linkedMid);

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linkedMid }, include: { recurrencePattern: true } });
  expect(created?.linkedToMid).toBe(anchor.mid);
  expect(created?.splitFromMid).toBeNull();
  expect(created?.status).toBe("Active");
  expect(created?.isRecurring).toBe(true);

  // Zoom identity inherited whole -- one Zoom meeting serves the family.
  expect(created?.zid).toBe(anchor.zid);
  expect(created?.zoomLink).toBe(anchor.zoomLink);
  expect(created?.zoomPasscode).toBe(anchor.zoomPasscode);
  expect(created?.zoomInvitation).toBe(anchor.zoomInvitation);
  expect(created?.zoomHost).toBe(anchor.zoomHost);
  expect(created?.zoomManaged).toBe(anchor.zoomManaged);
  // Never re-provisioned, and no fresh host capacity reserved for the inherited booking.
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
  expect(mockedResolveZoomHost).not.toHaveBeenCalled();

  // Identity/content copied from the anchor; only the mode and the weekdays are the linked
  // schedule's own.
  expect(created?.title).toBe(anchor.title);
  expect(created?.description).toBe(anchor.description);
  expect(created?.email).toBe(anchor.email);
  expect(created?.group).toBe(anchor.group);
  expect(created?.calType).toEqual(anchor.calType);
  expect(created?.modeType).toBe("Remote");
  expect(created?.recurrencePattern?.daysOfWeek).toEqual([LINKED_WEEKDAY]);
  expect(created?.recurrencePattern?.interval).toBe(1);

  // Re-anchored onto the first Saturday of the anchor's series, keeping its ET time of day and
  // its duration.
  expect(formatETDateString(created!.startDateTime)).toBe(FIRST_LINKED_ET_DATE);
  expect(getETTimeOfDay(created!.startDateTime)).toEqual(getETTimeOfDay(anchor.startDateTime));
  expect(created!.endDateTime.getTime() - created!.startDateTime.getTime())
    .toBe(anchor.endDateTime.getTime() - anchor.startDateTime.getTime());

  // The anchor row itself is only read, never rewritten.
  const anchorAfter = await prisma.meeting.findUnique({ where: { mid: anchor.mid } });
  expect(anchorAfter?.lastEditedBy).toBeNull();
  expect(anchorAfter?.modeType).toBe(anchor.modeType);
});

test("client-supplied schedule values that aren't the linked schedule's own are ignored", async () => {
  const anchor = await seedAnchor();
  const linkedMid = `linked-${randomUUID()}`;

  const response = await putMeeting(anchorPayload(anchor, {
    linkedSchedule: linkedBlock({
      mid: linkedMid,
      recurrencePattern: {
        type: "weekly",
        // Every one of these is the client trying to define the family's shape: a different
        // start, a different cadence, and an end of its own.
        startDate: new Date("2027-01-02T05:00:00Z"),
        endDate: new Date("2027-03-01T05:00:00Z"),
        numberOfOccurrences: 3,
        daysOfWeek: [LINKED_WEEKDAY],
        firstDayOfWeek: "Sunday",
        interval: 4,
      },
    }),
  }));
  expect(response.status).toBe(200);

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linkedMid }, include: { recurrencePattern: true } });
  expect(created?.recurrencePattern?.interval).toBe(1);
  expect(created?.recurrencePattern?.endDate).toBeNull();
  expect(created?.recurrencePattern?.numberOfOccurrences).toBeNull();
  expect(formatETDateString(created!.recurrencePattern!.startDate)).toBe(FIRST_LINKED_ET_DATE);
  await drainAfterTasks();
});

test("the whole family's external name is republished: the shared Zoom meeting and the anchor's calendar events", async () => {
  const anchor = await seedAnchor();
  const linkedMid = `linked-${randomUUID()}`;

  const response = await putMeeting(anchorPayload(anchor, { linkedSchedule: linkedBlock({ mid: linkedMid }) }));
  expect(response.status).toBe(200);
  await drainAfterTasks();

  // One PATCH of the family's single Zoom meeting, handed BOTH schedules so it can widen its
  // recurrence to their union and rename itself after the family.
  expect(mockedUpdateZoomMeeting).toHaveBeenCalledTimes(1);
  const [patchedZid, patchedMeeting, zoomFamily] = mockedUpdateZoomMeeting.mock.calls[0];
  expect(patchedZid).toBe(anchor.zid);
  expect(patchedMeeting.mid).toBe(anchor.mid);
  expect((zoomFamily as { mid: string }[]).map((row) => row.mid).sort()).toEqual([anchor.mid, linkedMid].sort());

  // The anchor's own calendar event is rewritten too -- its title named a one-schedule meeting
  // until this fan-out ran. buildEventTitle labels an event with exactly this call.
  const anchorRewrite = mockedUpdateCalendarEvent.mock.calls.find(([, eventId]) => eventId === "anchor-event-aa");
  expect(anchorRewrite).toBeDefined();
  const [, , anchorMeetingArg, anchorCalId, , anchorFamily] = anchorRewrite!;
  expect(anchorCalId).toBe("cal-AA");
  expect(buildLinkedScheduleLabel(anchorMeetingArg.title, anchorMeetingArg, anchorFamily))
    .toBe("Linked Family - Hybrid Mon - Zoom Only Sat");

  // ...and the new row's own event is born with that same family name, never its own lone mode.
  const linkedCreate = mockedCreateCalendarEvent.mock.calls.find(([, meetingArg]) => meetingArg.mid === linkedMid);
  expect(linkedCreate).toBeDefined();
  const [, linkedMeetingArg, , , linkedFamily] = linkedCreate!;
  expect(buildLinkedScheduleLabel(linkedMeetingArg.title, linkedMeetingArg, linkedFamily))
    .toBe("Linked Family - Hybrid Mon - Zoom Only Sat");
});

test("an In-Person schedule linked to a Hybrid anchor inherits no Zoom identity at all", async () => {
  const anchor = await seedAnchor();
  const linkedMid = `linked-${randomUUID()}`;

  const response = await putMeeting(anchorPayload(anchor, {
    linkedSchedule: linkedBlock({ mid: linkedMid, modeType: "In Person", room: `In Person Room ${randomUUID()}` }),
  }));
  expect(response.status).toBe(200);
  await drainAfterTasks();

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linkedMid } });
  expect(created?.linkedToMid).toBe(anchor.mid);
  expect(created?.zid).toBeNull();
  expect(created?.zoomLink).toBeNull();
  expect(created?.zoomHost).toBeNull();
  expect(created?.zoomInvitation).toBeNull();
  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();

  // The family still has a Zoom meeting (the anchor's), and it still gets renamed -- the
  // In-Person member names itself in the family's topic even though it holds no zid.
  expect(mockedUpdateZoomMeeting).toHaveBeenCalledTimes(1);
  const [, , zoomFamily] = mockedUpdateZoomMeeting.mock.calls[0];
  expect((zoomFamily as { mid: string }[]).map((row) => row.mid).sort()).toEqual([anchor.mid, linkedMid].sort());
});

test("a Remote schedule linked to an In-Person anchor provisions the family's Zoom meeting and becomes its zid holder", async () => {
  const anchor = await seedAnchor({
    modeType: "In Person",
    zoomRoom: null,
    zid: null,
    zoomLink: null,
    zoomPasscode: null,
    zoomInvitation: null,
    zoomHost: null,
  });
  mockedResolveZoomHost.mockResolvedValueOnce("linked-pool-host-1@icr.test");
  mockedCreateZoomMeeting.mockResolvedValueOnce({
    zid: "provisioned-zid", zoomLink: "https://zoom.us/j/provisioned", zoomPasscode: "provisioned-pass",
  });
  const linkedMid = `linked-${randomUUID()}`;

  const response = await putMeeting(anchorPayload(anchor, { linkedSchedule: linkedBlock({ mid: linkedMid }) }));
  expect(response.status).toBe(200);
  await drainAfterTasks();

  // There was no Zoom meeting to inherit, so this row mints the family's -- once, with the whole
  // family, so it is born holding the union schedule and the family's name.
  expect(mockedResolveZoomHost).toHaveBeenCalledTimes(1);
  expect(mockedCreateZoomMeeting).toHaveBeenCalledTimes(1);
  const [, createdHost, createFamily] = mockedCreateZoomMeeting.mock.calls[0];
  expect(createdHost).toBe("linked-pool-host-1@icr.test");
  expect((createFamily as { mid: string }[]).map((row) => row.mid).sort()).toEqual([anchor.mid, linkedMid].sort());
  // Nothing to widen: the create above already carried the family's schedule.
  expect(mockedUpdateZoomMeeting).not.toHaveBeenCalled();

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linkedMid } });
  expect(created?.zid).toBe("provisioned-zid");
  expect(created?.zoomLink).toBe("https://zoom.us/j/provisioned");
  expect(created?.zoomHost).toBe("linked-pool-host-1@icr.test");
  // The family is keyed on linkedToMid, so the Zoom-free anchor is still the root.
  expect(created?.linkedToMid).toBe(anchor.mid);
  const anchorAfter = await prisma.meeting.findUnique({ where: { mid: anchor.mid } });
  expect(anchorAfter?.zid).toBeNull();
});

test("an exhausted host pool leaves the linked row unpublished rather than half-published", async () => {
  const anchor = await seedAnchor({
    modeType: "In Person", zoomRoom: null, zid: null, zoomLink: null, zoomPasscode: null,
    zoomInvitation: null, zoomHost: null,
  });
  mockedResolveZoomHost.mockResolvedValueOnce(null);
  const linkedMid = `linked-${randomUUID()}`;

  const response = await putMeeting(anchorPayload(anchor, { linkedSchedule: linkedBlock({ mid: linkedMid }) }));
  expect(response.status).toBe(200);
  await drainAfterTasks();

  expect(mockedCreateZoomMeeting).not.toHaveBeenCalled();
  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findUnique({ where: { mid: linkedMid } });
  expect(created?.zoomSyncStatus).toBe("error");
  expect(created?.googleSyncStatus).toBe("pending");
  expect(mockedCreateCalendarEvent.mock.calls.some(([, meetingArg]) => meetingArg.mid === linkedMid)).toBe(false);
});

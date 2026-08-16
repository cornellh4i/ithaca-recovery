import { Meeting, RecurrencePattern, SuspensionPeriod } from "@prisma/client";

// suspension.ts's own logic is pure branching over its inputs -- the actual GCal/DB side effects
// are exactly what the existing suspend/resume integration tests mock away wholesale, which is
// the coverage gap this file closes: which event IDs get promoted/torn down, and under what
// conditions, driven by real recurrence-matching (util/meetings/meetingOccurrences.ts is left
// unmocked on purpose) rather than by a stubbed googleCalendar module.
jest.mock("../../services/googleCalendar", () => ({
  calendarIdsForMeeting: jest.fn(),
  createCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
}));
jest.mock("../../lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    meeting: { update: jest.fn() },
    suspensionPeriod: { update: jest.fn() },
  },
}));

import {
  reconcilePendingResume,
  createPendingResumeSeries,
  tearDownPendingResumeSeries,
  MeetingWithPattern,
  MeetingWithSuspensions,
} from "../../util/meetings/suspension";
import { calendarIdsForMeeting, createCalendarEvent, deleteCalendarEvent } from "../../services/googleCalendar";
import { prisma } from "../../lib/prisma";

const mockCalendarIdsForMeeting = calendarIdsForMeeting as jest.Mock;
const mockCreateCalendarEvent = createCalendarEvent as jest.Mock;
const mockDeleteCalendarEvent = deleteCalendarEvent as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockMeetingUpdate = prisma.meeting.update as jest.Mock;
const mockSuspensionUpdate = prisma.suspensionPeriod.update as jest.Mock;

const now = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const today = new Date(now);
const yesterday = new Date(now - DAY_MS);
const tomorrow = new Date(now + DAY_MS);
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" });
const etWeekday = (date: Date): string => weekdayFmt.format(date);

function buildMeeting(overrides: Partial<Meeting> = {}): Omit<Meeting, "recurrencePattern"> {
  return {
    id: "id-1",
    mid: "m-1",
    title: "Test Meeting",
    calType: ["AA"],
    description: "",
    creator: "creator@test.icr",
    group: "Group",
    startDateTime: new Date(now - DAY_MS),
    endDateTime: new Date(now - DAY_MS + 60 * 60 * 1000),
    email: "test@test.icr",
    zoomRoom: null,
    zoomLink: null,
    zid: null,
    zoomPasscode: null,
    zoomInvitation: null,
    room: "Serenity Room",
    modeType: "In Person",
    status: "Active",
    isRecurring: false,
    googleCalendarEventId: null,
    googleCalendarEventIds: null,
    googleSyncStatus: null,
    googleSyncError: null,
    zoomCalendarEventId: null,
    zoomSyncStatus: null,
    zoomHost: null,
    attemptedZoomHost: null,
    zoomSyncError: null,
    deletedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function buildRecurrencePattern(overrides: Partial<RecurrencePattern> = {}): RecurrencePattern {
  return {
    id: "rp-1",
    mid: "m-1",
    type: "weekly",
    startDate: new Date(now - 60 * DAY_MS),
    endDate: null,
    numberOfOccurrences: null,
    daysOfWeek: [],
    firstDayOfWeek: "Sunday",
    interval: 1,
    weekOfMonth: null,
    dayOfMonth: null,
    excludedDates: [],
    ...overrides,
  };
}

function buildSuspension(overrides: Partial<SuspensionPeriod> = {}): SuspensionPeriod {
  return {
    id: "s-1",
    mid: "m-1",
    from: yesterday,
    to: null,
    resumeEventIds: null,
    promoted: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("reconcilePendingResume", () => {
  it("returns the meeting's existing event IDs untouched when there is no pending suspension", async () => {
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: { AA: "evt-existing" } }),
      recurrencePattern: null,
      suspensions: [],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({ AA: "evt-existing" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("defaults to an empty object when there are no existing event IDs and nothing pending", async () => {
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: null }),
      recurrencePattern: null,
      suspensions: [],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({});
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("promotes a due, unpromoted suspension's pre-created event IDs onto the meeting", async () => {
    const pending = buildSuspension({
      id: "s-due",
      from: yesterday,
      to: yesterday,
      resumeEventIds: { AA: "evt-resume" },
      promoted: false,
    });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ mid: "m-42", googleCalendarEventIds: { AA: "evt-old" } }),
      recurrencePattern: null,
      suspensions: [pending],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({ AA: "evt-resume" });
    expect(mockMeetingUpdate).toHaveBeenCalledWith({
      where: { mid: "m-42" },
      data: { googleCalendarEventIds: { AA: "evt-resume" } },
    });
    expect(mockSuspensionUpdate).toHaveBeenCalledWith({
      where: { id: "s-due" },
      data: { promoted: true },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("promotes a suspension whose resume date is exactly today (the <= boundary, not just already-past)", async () => {
    const dueToday = buildSuspension({ id: "s-today", to: today, resumeEventIds: { AA: "evt-today" } });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: {} }),
      recurrencePattern: null,
      suspensions: [dueToday],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({ AA: "evt-today" });
    expect(mockSuspensionUpdate).toHaveBeenCalledWith({
      where: { id: "s-today" },
      data: { promoted: true },
    });
  });

  it("ignores a suspension whose resume date has not arrived yet", async () => {
    const notYetDue = buildSuspension({ to: tomorrow, resumeEventIds: { AA: "evt-future" } });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: { AA: "evt-current" } }),
      recurrencePattern: null,
      suspensions: [notYetDue],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({ AA: "evt-current" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ignores a suspension that has already been promoted", async () => {
    const alreadyPromoted = buildSuspension({ to: yesterday, resumeEventIds: { AA: "evt-x" }, promoted: true });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: {} }),
      recurrencePattern: null,
      suspensions: [alreadyPromoted],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({});
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ignores an open-ended suspension (to === null), since there is nothing to resume into yet", async () => {
    const openEnded = buildSuspension({ to: null, resumeEventIds: { AA: "evt-x" } });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: {} }),
      recurrencePattern: null,
      suspensions: [openEnded],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({});
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ignores a due suspension with no pre-created resumeEventIds", async () => {
    // Relies on buildSuspension's own default (null) -- a real SuspensionPeriod row's
    // resumeEventIds is never `undefined`, only `null` or a populated Json value.
    const noEventIds = buildSuspension({ to: yesterday });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: {} }),
      recurrencePattern: null,
      suspensions: [noEventIds],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({});
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("picks the most recently started suspension when more than one is due and unpromoted", async () => {
    const older = buildSuspension({
      id: "s-older",
      from: new Date(now - 10 * DAY_MS),
      to: yesterday,
      resumeEventIds: { AA: "evt-older" },
    });
    const newer = buildSuspension({
      id: "s-newer",
      from: new Date(now - 5 * DAY_MS),
      to: yesterday,
      resumeEventIds: { AA: "evt-newer" },
    });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting({ googleCalendarEventIds: {} }),
      recurrencePattern: null,
      // Order in the array shouldn't matter -- the function sorts by `from` itself.
      suspensions: [older, newer],
    };

    const result = await reconcilePendingResume(meeting);

    expect(result).toEqual({ AA: "evt-newer" });
    expect(mockSuspensionUpdate).toHaveBeenCalledWith({
      where: { id: "s-newer" },
      data: { promoted: true },
    });
    expect(mockSuspensionUpdate).not.toHaveBeenCalledWith({
      where: { id: "s-older" },
      data: { promoted: true },
    });
  });
});

describe("createPendingResumeSeries", () => {
  it("is a no-op when there is no access token", async () => {
    const meeting: MeetingWithPattern = { ...buildMeeting({ isRecurring: false }), recurrencePattern: null };

    const result = await createPendingResumeSeries(meeting, undefined, tomorrow);

    expect(result).toEqual({ resumeEventIds: {}, error: null });
    expect(mockCalendarIdsForMeeting).not.toHaveBeenCalled();
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it("pre-creates one event per configured calendar for a recurring meeting's next occurrence on/after resumeDate", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" });
    mockCreateCalendarEvent.mockResolvedValue({ id: "evt-new", error: null });

    const resumeDate = tomorrow;
    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: true, calType: ["AA"] }),
      recurrencePattern: buildRecurrencePattern({ daysOfWeek: [etWeekday(resumeDate)], interval: 1 }),
    };

    const result = await createPendingResumeSeries(meeting, "token-1", resumeDate);

    expect(mockCalendarIdsForMeeting).toHaveBeenCalledWith(["AA"]);
    expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      "token-1",
      expect.objectContaining({ mid: meeting.mid }),
      "cal-aa",
    );
    expect(result).toEqual({ resumeEventIds: { AA: "evt-new" }, error: null });
  });

  it("is a no-op (with no error) for a recurring meeting whose series has already ended by resumeDate", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" });

    const resumeDate = tomorrow;
    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: true, calType: ["AA"] }),
      // endDate before resumeDate -- no occurrence left to pre-create.
      recurrencePattern: buildRecurrencePattern({
        daysOfWeek: [etWeekday(resumeDate)],
        endDate: yesterday,
      }),
    };

    const result = await createPendingResumeSeries(meeting, "token-1", resumeDate);

    expect(result).toEqual({ resumeEventIds: {}, error: null });
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it("stays a genuine no-op (error: null) when there's no upcoming occurrence, even if the meeting also has an unconfigured category", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" }); // "Missing" deliberately absent

    const resumeDate = tomorrow;
    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: true, calType: ["AA", "Missing"] }),
      // endDate before resumeDate -- no occurrence left to pre-create, same as the test above,
      // but combined with a category that's also unconfigured.
      recurrencePattern: buildRecurrencePattern({
        daysOfWeek: [etWeekday(resumeDate)],
        endDate: yesterday,
      }),
    };

    const result = await createPendingResumeSeries(meeting, "token-1", resumeDate);

    // "No occurrence" must stay a genuine no-op -- it must not surface a misconfiguration error
    // just because an unrelated category also happens to be unconfigured.
    expect(result).toEqual({ resumeEventIds: {}, error: null });
    // calendarIds is resolved unconditionally up front, before the recurring/one-time branch
    // even runs -- "Missing" was still looked up, it's the *reporting* of it that's correctly
    // suppressed here, not the lookup itself.
    expect(mockCalendarIdsForMeeting).toHaveBeenCalledWith(["AA", "Missing"]);
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it("records an unconfigured-calendar error but still creates events for the categories that are configured", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" }); // "Other" deliberately missing
    mockCreateCalendarEvent.mockResolvedValue({ id: "evt-aa", error: null });

    const resumeDate = tomorrow;
    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: true, calType: ["AA", "Other"] }),
      recurrencePattern: buildRecurrencePattern({ daysOfWeek: [etWeekday(resumeDate)] }),
    };

    const result = await createPendingResumeSeries(meeting, "token-1", resumeDate);

    expect(mockCalendarIdsForMeeting).toHaveBeenCalledWith(["AA", "Other"]);
    expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      resumeEventIds: { AA: "evt-aa" },
      error: 'Calendar for "Other" is not configured.',
    });
  });

  it("keeps the first Google error and omits that category from resumeEventIds when a create call fails", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa", Other: "cal-other" });
    mockCreateCalendarEvent.mockImplementation((_token: string, _meeting: unknown, calId: string) =>
      calId === "cal-aa"
        ? Promise.resolve({ id: null, error: "Google rejected the AA event" })
        : Promise.resolve({ id: "evt-other", error: null }),
    );

    const resumeDate = tomorrow;
    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: true, calType: ["AA", "Other"] }),
      recurrencePattern: buildRecurrencePattern({ daysOfWeek: [etWeekday(resumeDate)] }),
    };

    const result = await createPendingResumeSeries(meeting, "token-1", resumeDate);

    expect(result).toEqual({
      resumeEventIds: { Other: "evt-other" },
      error: "Google rejected the AA event",
    });
  });

  it("keeps the unconfigured-category error as the first error, not overwritten by a later create failure", async () => {
    // Two independent failure sources: "Missing" is unconfigured (recorded before the create
    // loop even starts), and the configured "AA" category's create call also fails. The
    // unconfigured-category error must win -- it happened first.
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa", Other: "cal-other" }); // "Missing" deliberately absent
    mockCreateCalendarEvent.mockImplementation((_token: string, _meeting: unknown, calId: string) =>
      calId === "cal-aa"
        ? Promise.resolve({ id: null, error: "Google rejected the AA event" })
        : Promise.resolve({ id: "evt-other", error: null }),
    );

    const resumeDate = tomorrow;
    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: true, calType: ["AA", "Missing", "Other"] }),
      recurrencePattern: buildRecurrencePattern({ daysOfWeek: [etWeekday(resumeDate)] }),
    };

    const result = await createPendingResumeSeries(meeting, "token-1", resumeDate);

    expect(result).toEqual({
      resumeEventIds: { Other: "evt-other" },
      error: 'Calendar for "Missing" is not configured.',
    });
  });

  it("pre-creates an event for a future one-time meeting", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" });
    mockCreateCalendarEvent.mockResolvedValue({ id: "evt-onetime", error: null });

    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: false, calType: ["AA"], startDateTime: tomorrow, endDateTime: new Date(tomorrow.getTime() + 60 * 60 * 1000) }),
      recurrencePattern: null,
    };

    const result = await createPendingResumeSeries(meeting, "token-1", tomorrow);

    expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ resumeEventIds: { AA: "evt-onetime" }, error: null });
  });

  it("is a no-op for a one-time meeting whose original occurrence has already passed", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" });

    const meeting: MeetingWithPattern = {
      ...buildMeeting({ isRecurring: false, calType: ["AA"], startDateTime: yesterday, endDateTime: yesterday }),
      recurrencePattern: null,
    };

    const result = await createPendingResumeSeries(meeting, "token-1", yesterday);

    expect(result).toEqual({ resumeEventIds: {}, error: null });
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("tearDownPendingResumeSeries", () => {
  it("is a no-op when there is no access token", async () => {
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting(),
      recurrencePattern: null,
      suspensions: [buildSuspension({ resumeEventIds: { AA: "evt-1" } })],
    };

    await tearDownPendingResumeSeries(meeting, undefined);

    expect(mockCalendarIdsForMeeting).not.toHaveBeenCalled();
    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("deletes every event in an unpromoted suspension's pre-created series", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa", Other: "cal-other" });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting(),
      recurrencePattern: null,
      suspensions: [buildSuspension({ resumeEventIds: { AA: "evt-aa", Other: "evt-other" } })],
    };

    await tearDownPendingResumeSeries(meeting, "token-1");

    expect(mockCalendarIdsForMeeting).toHaveBeenCalledWith(["AA", "Other"]);
    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("token-1", "evt-aa", "cal-aa");
    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("token-1", "evt-other", "cal-other");
    expect(mockDeleteCalendarEvent).toHaveBeenCalledTimes(2);
  });

  it("skips a suspension that has already been promoted", async () => {
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting(),
      recurrencePattern: null,
      suspensions: [buildSuspension({ resumeEventIds: { AA: "evt-1" }, promoted: true })],
    };

    await tearDownPendingResumeSeries(meeting, "token-1");

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("skips a suspension with no pre-created resume series", async () => {
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting(),
      recurrencePattern: null,
      suspensions: [buildSuspension({ resumeEventIds: null })],
    };

    await tearDownPendingResumeSeries(meeting, "token-1");

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("skips only the categories that have since been dropped from calendar config, not the whole series", async () => {
    // "Other" was configured when this pending series was pre-created, but has since been
    // removed from GOOGLE_CALENDAR_* env config -- its event would otherwise be orphaned.
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting(),
      recurrencePattern: null,
      suspensions: [buildSuspension({ resumeEventIds: { AA: "evt-aa", Other: "evt-other" } })],
    };

    await tearDownPendingResumeSeries(meeting, "token-1");

    expect(mockDeleteCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("token-1", "evt-aa", "cal-aa");
  });

  it("tears down every unpromoted suspension's series, not just the most recent one", async () => {
    mockCalendarIdsForMeeting.mockReturnValue({ AA: "cal-aa" });
    const meeting: MeetingWithSuspensions = {
      ...buildMeeting(),
      recurrencePattern: null,
      suspensions: [
        buildSuspension({ id: "s-1", resumeEventIds: { AA: "evt-1" } }),
        buildSuspension({ id: "s-2", resumeEventIds: { AA: "evt-2" } }),
      ],
    };

    await tearDownPendingResumeSeries(meeting, "token-1");

    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("token-1", "evt-1", "cal-aa");
    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("token-1", "evt-2", "cal-aa");
    expect(mockDeleteCalendarEvent).toHaveBeenCalledTimes(2);
  });
});

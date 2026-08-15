import {
  expandOccurrences,
  occurrencesOverlap,
  computeConflicts,
  OVERLAP_HORIZON_YEARS,
  type ConflictCandidateMeeting,
} from "../../util/meetings/resourceOverlap";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";

const utcDate = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min));

// computeConflicts derives "suspended" from suspensions[], not the status field -- this fixture
// stands in for "suspended indefinitely, started well in the past."
const suspendedIndefinitely = [{ from: utcDate(2020, 1, 1), to: null }];

const weeklyMondayPattern = {
  type: "weekly",
  startDate: utcDate(2026, 7, 6), // a Monday
  endDate: null,
  interval: 1,
  daysOfWeek: ["Monday"],
  weekOfMonth: null,
  dayOfMonth: null,
  excludedDates: [],
};

describe("expandOccurrences — non-recurring", () => {
  const meeting = {
    startDateTime: utcDate(2026, 7, 8, 19, 0),
    endDateTime: utcDate(2026, 7, 8, 20, 0),
    isRecurring: false,
    recurrencePattern: null,
  };

  it("returns one occurrence when the meeting intersects the range", () => {
    const occurrences = expandOccurrences(meeting, utcDate(2026, 7, 1), utcDate(2026, 7, 31));
    expect(occurrences).toEqual([{ start: meeting.startDateTime, end: meeting.endDateTime }]);
  });

  it("returns nothing when the meeting falls outside the range", () => {
    const occurrences = expandOccurrences(meeting, utcDate(2026, 8, 1), utcDate(2026, 8, 31));
    expect(occurrences).toEqual([]);
  });
});

describe("expandOccurrences — recurring", () => {
  const meeting = {
    startDateTime: utcDate(2026, 7, 6, 19, 0),
    endDateTime: utcDate(2026, 7, 6, 20, 0),
    isRecurring: true,
    recurrencePattern: weeklyMondayPattern,
  };

  it("expands one occurrence per matching week within the range", () => {
    const occurrences = expandOccurrences(meeting, utcDate(2026, 7, 1), utcDate(2026, 7, 22));
    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((o) => o.start.toISOString())).toEqual([
      utcDate(2026, 7, 6, 19, 0).toISOString(),
      utcDate(2026, 7, 13, 19, 0).toISOString(),
      utcDate(2026, 7, 20, 19, 0).toISOString(),
    ]);
  });

  it("stops expanding at the horizon boundary passed in", () => {
    // Open-ended series (endDate: null) — only bounded by whatever range the caller passes,
    // exactly like findResourceConflicts/computeConflicts pass [now, now + horizonYears).
    // rangeEnd is given as late-in-the-day UTC so it still reads as July 13 once read back in
    // ET (ET trails UTC, so a bare UTC midnight would roll back to July 12 ET instead).
    const occurrences = expandOccurrences(meeting, utcDate(2026, 7, 1), utcDate(2026, 7, 13, 23, 59));
    expect(occurrences).toHaveLength(2);
    expect(occurrences[occurrences.length - 1].start.toISOString()).toBe(utcDate(2026, 7, 13, 19, 0).toISOString());
  });

  it("never expands past a series end date even when the range extends further", () => {
    const boundedMeeting = {
      ...meeting,
      recurrencePattern: { ...weeklyMondayPattern, endDate: utcDate(2026, 7, 13, 23, 59) },
    };
    const occurrences = expandOccurrences(boundedMeeting, utcDate(2026, 7, 1), utcDate(2026, 8, 1));
    expect(occurrences).toHaveLength(2);
  });
});

describe("expandOccurrences — DST spring-forward gap", () => {
  // Regression: a weekly Sunday meeting anchored at 2:30 AM ET lands, once a year, on a Sunday
  // where 2:00-2:59 AM ET doesn't exist (the 2nd Sunday of March -- March 8, 2026). That single
  // occurrence must be skipped, not throw all the way out and take every other occurrence (and,
  // one level up, every other meeting in the same request) down with it.
  it("skips the one occurrence that falls in the gap, keeping every other week's occurrence", () => {
    const meeting = {
      // Feb 1, 2026 is a Sunday -- the same weekday as the March 8 gap date, 7-day-aligned.
      startDateTime: new Date(convertETToUTC("2026-02-01T02:30:00")),
      endDateTime: new Date(convertETToUTC("2026-02-01T02:45:00")),
      isRecurring: true,
      recurrencePattern: {
        type: "weekly",
        startDate: utcDate(2026, 2, 1),
        endDate: null,
        interval: 1,
        daysOfWeek: ["Sunday"],
        weekOfMonth: null,
        dayOfMonth: null,
        excludedDates: [],
      },
    };

    const occurrences = expandOccurrences(meeting, utcDate(2026, 3, 1), utcDate(2026, 3, 15, 23, 59));

    // March 1, March 8 (gap -- skipped), March 15 would otherwise be 3 occurrences.
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o) => formatETDateString(o.start))).toEqual(["2026-03-01", "2026-03-15"]);
  });
});

describe("occurrencesOverlap", () => {
  it("detects an intersecting pair", () => {
    const a = [{ start: utcDate(2026, 7, 6, 19, 0), end: utcDate(2026, 7, 6, 20, 0) }];
    const b = [{ start: utcDate(2026, 7, 6, 19, 30), end: utcDate(2026, 7, 6, 20, 30) }];
    expect(occurrencesOverlap(a, b)).toBe(true);
  });

  it("returns false for back-to-back (touching, not overlapping) occurrences", () => {
    const a = [{ start: utcDate(2026, 7, 6, 19, 0), end: utcDate(2026, 7, 6, 20, 0) }];
    const b = [{ start: utcDate(2026, 7, 6, 20, 0), end: utcDate(2026, 7, 6, 21, 0) }];
    expect(occurrencesOverlap(a, b)).toBe(false);
  });

  it("finds an overlap anywhere in two longer sorted lists", () => {
    const a = [
      { start: utcDate(2026, 7, 6, 19, 0), end: utcDate(2026, 7, 6, 20, 0) },
      { start: utcDate(2026, 7, 20, 19, 0), end: utcDate(2026, 7, 20, 20, 0) },
    ];
    const b = [
      { start: utcDate(2026, 7, 13, 19, 0), end: utcDate(2026, 7, 13, 20, 0) },
      { start: utcDate(2026, 7, 20, 19, 30), end: utcDate(2026, 7, 20, 20, 30) },
    ];
    expect(occurrencesOverlap(a, b)).toBe(true);
  });

  it("returns false when neither list intersects the other", () => {
    const a = [{ start: utcDate(2026, 7, 6, 19, 0), end: utcDate(2026, 7, 6, 20, 0) }];
    const b = [{ start: utcDate(2026, 7, 13, 19, 0), end: utcDate(2026, 7, 13, 20, 0) }];
    expect(occurrencesOverlap(a, b)).toBe(false);
  });
});

describe("computeConflicts", () => {
  // computeConflicts anchors its horizon window to Date.now() internally, so pin the clock to
  // keep the fixture dates below (all July 2026) inside [now, now + horizon) deterministically.
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(utcDate(2026, 7, 1));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const baseMeeting: ConflictCandidateMeeting = {
    mid: "m1",
    title: "Meeting One",
    room: "Serenity Room",
    zoomRoom: null,
    status: "Active",
    startDateTime: utcDate(2026, 7, 6, 19, 0),
    endDateTime: utcDate(2026, 7, 6, 20, 0),
    isRecurring: false,
    recurrencePattern: null,
  };

  it("flags two non-recurring meetings sharing a room at overlapping times", () => {
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };

    const conflicts = computeConflicts([baseMeeting, meetingTwo]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("room");
    expect(conflicts[0].value).toBe("Serenity Room");
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["m1", "m2"]);
  });

  it("does not flag meetings in different rooms", () => {
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      room: "Unity Room",
    };
    expect(computeConflicts([baseMeeting, meetingTwo])).toEqual([]);
  });

  it("does not flag non-overlapping meetings in the same room", () => {
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      startDateTime: utcDate(2026, 7, 6, 20, 0),
      endDateTime: utcDate(2026, 7, 6, 21, 0),
    };
    expect(computeConflicts([baseMeeting, meetingTwo])).toEqual([]);
  });

  it("excludes suspended meetings from conflict checks", () => {
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      suspensions: suspendedIndefinitely,
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };
    expect(computeConflicts([baseMeeting, meetingTwo])).toEqual([]);
  });

  it("also flags shared zoomRoom conflicts independently of room conflicts", () => {
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      room: "Unity Room",
      zoomRoom: "Serenity Room - Zoom",
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };
    const withZoom: ConflictCandidateMeeting = { ...baseMeeting, zoomRoom: "Serenity Room - Zoom" };

    const conflicts = computeConflicts([withZoom, meetingTwo]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("zoomRoom");
  });

  it("also flags shared zoomHost conflicts independently of room/zoomRoom conflicts", () => {
    const withHost: ConflictCandidateMeeting = { ...baseMeeting, zoomHost: "host1@icr.test" };
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      room: "Unity Room",
      zoomHost: "host1@icr.test",
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };

    const conflicts = computeConflicts([withHost, meetingTwo]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("zoomHost");
    expect(conflicts[0].value).toBe("host1@icr.test");
  });

  it("flags a zoomHost conflict even when one of the two meetings is suspended", () => {
    // Unlike room/zoomRoom, a suspended meeting's Zoom host is still genuinely reserved
    // (its Zoom sync is skipped, not torn down) -- see resolveZoomHost's includeSuspended: true.
    const withHost: ConflictCandidateMeeting = { ...baseMeeting, zoomHost: "host1@icr.test", suspensions: suspendedIndefinitely };
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      zoomHost: "host1@icr.test",
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };

    const conflicts = computeConflicts([withHost, meetingTwo]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("zoomHost");
  });

  it("flags a zoomHost conflict via attemptedZoomHost when the losing meeting's zoomHost is null", () => {
    // Reproduces the ABC/MRAO bug: an explicit host pick that lost out to another meeting is
    // persisted with zoomHost: null (see write/meeting/route.ts), so it has nothing to bucket
    // on under the raw "zoomHost" field despite already carrying a recorded zoomSyncError for
    // exactly this collision. attemptedZoomHost is the fallback that keeps it visible here.
    const withHost: ConflictCandidateMeeting = { ...baseMeeting, zoomHost: "host1@icr.test" };
    const losingMeeting: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      room: "Unity Room",
      zoomHost: null,
      attemptedZoomHost: "host1@icr.test",
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };

    const conflicts = computeConflicts([withHost, losingMeeting]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("zoomHost");
    expect(conflicts[0].value).toBe("host1@icr.test");
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["m1", "m2"]);
  });

  it("does not flag two suspended meetings sharing a room (room conflicts still exclude suspended)", () => {
    const meetingOne: ConflictCandidateMeeting = { ...baseMeeting, suspensions: suspendedIndefinitely };
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      suspensions: suspendedIndefinitely,
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };
    expect(computeConflicts([meetingOne, meetingTwo])).toEqual([]);
  });

  it("respects the horizon boundary for a recurring series with no end date", () => {
    const recurringMeeting: ConflictCandidateMeeting = {
      ...baseMeeting,
      isRecurring: true,
      recurrencePattern: weeklyMondayPattern,
    };
    const farFutureConflict: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      isRecurring: true,
      recurrencePattern: {
        ...weeklyMondayPattern,
        startDate: utcDate(2026, 7, 6 + 7 * 52 * (OVERLAP_HORIZON_YEARS + 1), 19, 0), // far beyond the horizon
      },
    };
    expect(computeConflicts([recurringMeeting, farFutureConflict])).toEqual([]);
  });
});

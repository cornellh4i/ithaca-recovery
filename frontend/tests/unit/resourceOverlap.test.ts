import type { Prisma } from "@prisma/client";
import {
  expandOccurrences,
  occurrencesOverlap,
  computeConflicts,
  findOverCapacityWindow,
  findFirstFreePoolHost,
  findResourceConflictRows,
  getPoolHostLoads,
  OVERLAP_HORIZON_YEARS,
  type ConflictCandidateMeeting,
  type Occurrence,
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

  it("buckets two casings of one host email together (#504), keeping a real stored casing in the row", () => {
    const withHost: ConflictCandidateMeeting = { ...baseMeeting, zoomHost: "518Board@gmail.com" };
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      room: "Unity Room",
      zoomHost: "518board@gmail.com",
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };

    const conflicts = computeConflicts([withHost, meetingTwo]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("zoomHost");
    expect(conflicts[0].value).toBe("518Board@gmail.com");
  });

  it("resolves a host's capacity case-insensitively, so two meetings on one licensed host stay healthy across casings", () => {
    const withHost: ConflictCandidateMeeting = { ...baseMeeting, zoomHost: "518Board@gmail.com" };
    const meetingTwo: ConflictCandidateMeeting = {
      ...baseMeeting,
      mid: "m2",
      title: "Meeting Two",
      room: "Unity Room",
      zoomHost: "518board@gmail.com",
      startDateTime: utcDate(2026, 7, 6, 19, 30),
      endDateTime: utcDate(2026, 7, 6, 20, 30),
    };

    // Capacities arrive keyed in ZOOM_HOSTS casing; the bucket's display value is DB casing.
    const conflicts = computeConflicts([withHost, meetingTwo], OVERLAP_HORIZON_YEARS, {
      zoomHostCapacities: { "518board@GMAIL.com": 2 },
    });
    expect(conflicts).toEqual([]);
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

describe("findOverCapacityWindow", () => {
  const occ = (startHour: number, endHour: number, day = 6): Occurrence => ({
    start: utcDate(2026, 7, day, startHour, 0),
    end: utcDate(2026, 7, day, endHour, 0),
  });

  it("flags the window where `capacity` other meetings share one instant, listing both of them", () => {
    const candidate = [occ(19, 20)];
    const over = findOverCapacityWindow(candidate, [[occ(18, 20)], [occ(19, 21)]], 2);

    expect(over).not.toBeNull();
    expect(over?.meetingIndexes.sort()).toEqual([0, 1]);
    expect(over?.candidateOccurrence).toEqual(candidate[0]);
    expect(over?.window.start.toISOString()).toBe(utcDate(2026, 7, 6, 19, 0).toISOString());
  });

  it("returns null for two other meetings at disjoint times inside one long candidate occurrence", () => {
    // The instant-level distinction: both overlap the candidate, but never each other, so a
    // capacity-2 host is never asked to run more than one of them at a time.
    const candidate = [occ(9, 21)];
    expect(findOverCapacityWindow(candidate, [[occ(10, 11)], [occ(12, 13)]], 2)).toBeNull();
  });

  it("does not treat back-to-back other meetings as concurrent", () => {
    const candidate = [occ(9, 21)];
    expect(findOverCapacityWindow(candidate, [[occ(10, 11)], [occ(11, 12)]], 2)).toBeNull();
  });

  it("counts one meeting's own two overlapping segments as a single concurrent meeting", () => {
    const candidate = [occ(9, 21)];
    const oneMeetingTwoSegments = [occ(10, 12), occ(11, 13)];
    expect(findOverCapacityWindow(candidate, [oneMeetingTwoSegments], 2)).toBeNull();
    // A second, genuinely distinct meeting during those segments does exceed capacity 2.
    const over = findOverCapacityWindow(candidate, [oneMeetingTwoSegments, [occ(11, 12)]], 2);
    expect(over?.meetingIndexes.sort()).toEqual([0, 1]);
  });

  it("is plain overlap detection at capacity 1", () => {
    const candidate = [occ(19, 20)];
    expect(findOverCapacityWindow(candidate, [[occ(19, 21)]], 1)).not.toBeNull();
    expect(findOverCapacityWindow(candidate, [[occ(20, 21)]], 1)).toBeNull();
    expect(findOverCapacityWindow(candidate, [], 1)).toBeNull();
  });

  it("returns null when no other meeting touches the candidate at all", () => {
    expect(findOverCapacityWindow([occ(19, 20)], [[occ(19, 20, 13)], [occ(19, 20, 20)]], 2)).toBeNull();
  });
});

// Rows as the two DB-backed helpers select them -- the stub client below ignores the `where`
// clause, so each test passes exactly the rows its query would have returned.
type StubRow = {
  mid?: string;
  title?: string;
  calType?: string[];
  zoomHost?: string | null;
  startDateTime: Date;
  endDateTime: Date;
  isRecurring?: boolean;
  recurrencePattern?: typeof weeklyMondayPattern | null;
  suspensions?: { from: Date; to: Date | null }[];
};

const stubClient = (rows: StubRow[]) =>
  ({
    meeting: {
      findMany: async () =>
        rows.map((row, i) => ({
          mid: row.mid ?? `stub-${i}`,
          title: row.title ?? `Stub ${i}`,
          calType: row.calType ?? ["AA"],
          zoomHost: row.zoomHost ?? null,
          isRecurring: row.isRecurring ?? false,
          recurrencePattern: row.recurrencePattern ?? null,
          suspensions: row.suspensions ?? [],
          startDateTime: row.startDateTime,
          endDateTime: row.endDateTime,
        })),
    },
  }) as unknown as Prisma.TransactionClient;

describe("findFirstFreePoolHost — per-host capacities", () => {
  // Both helpers below anchor their horizon window to Date.now(); pinned so the July 2026
  // fixtures stay inside it.
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(utcDate(2026, 7, 1));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const pool = ["licensed@icr.test", "basic@icr.test"];
  const candidate = {
    startDateTime: utcDate(2026, 7, 6, 19, 0),
    endDateTime: utcDate(2026, 7, 6, 20, 0),
    isRecurring: false,
    recurrencePattern: null,
  };
  const onHost = (host: string, startHour: number, endHour: number): StubRow => ({
    zoomHost: host,
    startDateTime: utcDate(2026, 7, 6, startHour, 0),
    endDateTime: utcDate(2026, 7, 6, endHour, 0),
  });

  it("spreads a second overlapping meeting onto the idle licensed host (least-loaded)", async () => {
    const host = await findFirstFreePoolHost(pool, candidate, stubClient([onHost(pool[0], 19, 20)]), {
      capacities: { [pool[0]]: 2, [pool[1]]: 2 },
    });
    expect(host).toBe(pool[1]);
  });

  it("stacks onto a loaded licensed host rather than falling back to an idle basic host", async () => {
    const host = await findFirstFreePoolHost(pool, candidate, stubClient([onHost(pool[0], 19, 20)]), {
      capacities: { [pool[0]]: 2, [pool[1]]: 1 },
    });
    expect(host).toBe(pool[0]);
  });

  it("counts a row stored in Zoom-registered casing against the ZOOM_HOSTS-cased pool entry (#504)", async () => {
    // Without case-insensitive bucketing this row splits into a phantom host, both pool
    // entries look idle, and least-loaded would pick pool[0] -- over-booking the real host.
    const host = await findFirstFreePoolHost(pool, candidate, stubClient([onHost("Licensed@ICR.test", 19, 20)]), {
      capacities: { [pool[0]]: 2, [pool[1]]: 2 },
    });
    expect(host).toBe(pool[1]);
  });

  it("uses a basic host only once every licensed host is at capacity", async () => {
    const host = await findFirstFreePoolHost(
      pool,
      candidate,
      stubClient([onHost(pool[0], 19, 20), onHost(pool[0], 18, 21)]),
      { capacities: { [pool[0]]: 2, [pool[1]]: 1 } },
    );
    expect(host).toBe(pool[1]);
  });

  it("breaks least-loaded ties by pool list order", async () => {
    const host = await findFirstFreePoolHost(pool, candidate, stubClient([]), {
      capacities: { [pool[0]]: 2, [pool[1]]: 2 },
    });
    expect(host).toBe(pool[0]);
  });

  it("prefers a licensed host even when the candidate expands to no occurrences", async () => {
    // A candidate outside the horizon window expands to nothing -- the licensed-first
    // ordering must still hold rather than defaulting to whatever host is first in the pool.
    const farFuture = {
      startDateTime: utcDate(2035, 7, 6, 19, 0),
      endDateTime: utcDate(2035, 7, 6, 20, 0),
      isRecurring: false,
      recurrencePattern: null,
    };
    const host = await findFirstFreePoolHost(["basic@icr.test", "licensed@icr.test"], farFuture, stubClient([]), {
      capacities: { "basic@icr.test": 1, "licensed@icr.test": 2 },
    });
    expect(host).toBe("licensed@icr.test");
  });

  it("moves on once a capacity-2 host already has two concurrent meetings", async () => {
    const host = await findFirstFreePoolHost(
      pool,
      candidate,
      stubClient([onHost(pool[0], 19, 20), onHost(pool[0], 18, 21)]),
      { capacities: { [pool[0]]: 2, [pool[1]]: 2 } },
    );
    expect(host).toBe(pool[1]);
  });

  it("returns null when every capacity-2 host is carrying two concurrent meetings", async () => {
    const host = await findFirstFreePoolHost(
      pool,
      candidate,
      stubClient([
        onHost(pool[0], 19, 20), onHost(pool[0], 18, 21),
        onHost(pool[1], 19, 20), onHost(pool[1], 18, 21),
      ]),
      { capacities: { [pool[0]]: 2, [pool[1]]: 2 } },
    );
    expect(host).toBeNull();
  });

  it("fails safe to capacity 1 for a host missing from the capacities map", async () => {
    const host = await findFirstFreePoolHost(pool, candidate, stubClient([onHost(pool[0], 19, 20)]), {
      capacities: { [pool[1]]: 2 },
    });
    expect(host).toBe(pool[1]);
  });
});

describe("getPoolHostLoads", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(utcDate(2026, 7, 1));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const pool = ["host-a@icr.test", "host-b@icr.test"];
  const onHost = (host: string, startHour: number, endHour: number, day = 6): StubRow => ({
    zoomHost: host,
    startDateTime: utcDate(2026, 7, day, startHour, 0),
    endDateTime: utcDate(2026, 7, day, endHour, 0),
  });

  it("reports each host's peak concurrency during the candidate, in pool order", async () => {
    const candidate = {
      startDateTime: utcDate(2026, 7, 6, 19, 0),
      endDateTime: utcDate(2026, 7, 6, 21, 0),
      isRecurring: false,
      recurrencePattern: null,
    };
    const loads = await getPoolHostLoads(
      pool,
      candidate,
      stubClient([
        onHost(pool[0], 19, 20), onHost(pool[0], 19, 20),
        // Disjoint inside the candidate -- host-b's peak is 1, not 2.
        onHost(pool[1], 19, 20), onHost(pool[1], 20, 21),
      ]),
      { includeSuspended: true },
    );
    expect(loads).toEqual([
      { host: pool[0], peak: 2 },
      { host: pool[1], peak: 1 },
    ]);
  });

  it("uses the candidate's worst occurrence, not the first", async () => {
    // Weekly Thursday candidate (Jul 9, 16, 23, 30 2026 ET); host-a only collides on the
    // second week -- the peak must still register, since assignment sees every occurrence.
    const candidate = {
      startDateTime: utcDate(2026, 7, 9, 19, 0),
      endDateTime: utcDate(2026, 7, 9, 20, 0),
      isRecurring: true,
      recurrencePattern: {
        type: "weekly",
        startDate: utcDate(2026, 7, 9),
        endDate: utcDate(2026, 7, 31),
        interval: 1,
        daysOfWeek: ["Thursday"],
      },
    };
    const loads = await getPoolHostLoads(pool, candidate, stubClient([onHost(pool[0], 19, 20, 16)]), {
      includeSuspended: true,
    });
    expect(loads[0]).toEqual({ host: pool[0], peak: 1 });
    expect(loads[1]).toEqual({ host: pool[1], peak: 0 });
  });
});

describe("findResourceConflictRows — capacity 2", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(utcDate(2026, 7, 1));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const host = "licensed@icr.test";
  const candidate: ConflictCandidateMeeting = {
    mid: "cand",
    title: "Candidate",
    room: "",
    zoomRoom: null,
    zoomHost: host,
    calType: ["AA"],
    startDateTime: utcDate(2026, 7, 6, 19, 0),
    endDateTime: utcDate(2026, 7, 6, 20, 0),
    isRecurring: false,
    recurrencePattern: null,
  };
  const existing = (mid: string, startHour: number, endHour: number): StubRow => ({
    mid,
    title: mid,
    zoomHost: host,
    startDateTime: utcDate(2026, 7, 6, startHour, 0),
    endDateTime: utcDate(2026, 7, 6, endHour, 0),
  });

  it("returns no rows when the candidate is only the second meeting on the host", async () => {
    const rows = await findResourceConflictRows("zoomHost", host, candidate, stubClient([existing("m1", 19, 20)]), {
      includeSuspended: true,
      capacity: 2,
    });
    expect(rows).toEqual([]);
  });

  it("emits one N-way row (candidate plus both active meetings) when the candidate would be the third", async () => {
    const rows = await findResourceConflictRows(
      "zoomHost",
      host,
      candidate,
      stubClient([existing("m1", 19, 20), existing("m2", 18, 21)]),
      { includeSuspended: true, capacity: 2 },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ field: "zoomHost", value: host });
    expect(rows[0].meetings).toHaveLength(3);
    expect(rows[0].meetings.map((m) => m.mid).sort()).toEqual(["cand", "m1", "m2"]);
    expect(rows[0].overlap.start.toISOString()).toBe(utcDate(2026, 7, 6, 19, 0).toISOString());
  });

  it("still emits one row per existing meeting at capacity 1", async () => {
    const rows = await findResourceConflictRows(
      "zoomHost",
      host,
      candidate,
      stubClient([existing("m1", 19, 20), existing("m2", 18, 21)]),
      { includeSuspended: true },
    );
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.meetings).toHaveLength(2));
  });
});

describe("computeConflicts — capacity-aware Zoom hosts", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(utcDate(2026, 7, 1));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const host = "licensed@icr.test";
  const capacities = { [host]: 2 };

  // Distinct rooms throughout -- these fixtures are about the zoomHost bucket, and a shared room
  // would add its own (capacity-1) rows on top.
  const onHost = (mid: string, room: string, startHour: number, endHour: number, day = 6): ConflictCandidateMeeting => ({
    mid,
    title: mid,
    room,
    zoomRoom: null,
    zoomHost: host,
    status: "Active",
    startDateTime: utcDate(2026, 7, day, startHour, 0),
    endDateTime: utcDate(2026, 7, day, endHour, 0),
    isRecurring: false,
    recurrencePattern: null,
  });

  it("does not flag two concurrent meetings on a capacity-2 host", () => {
    const conflicts = computeConflicts(
      [onHost("m1", "Room A", 19, 20), onHost("m2", "Room B", 19, 20)],
      undefined,
      { zoomHostCapacities: capacities },
    );
    expect(conflicts).toEqual([]);
  });

  it("flags one N-way row listing all three meetings once a third shares the instant", () => {
    const conflicts = computeConflicts(
      [onHost("m1", "Room A", 19, 20), onHost("m2", "Room B", 19, 20), onHost("m3", "Room C", 19, 20)],
      undefined,
      { zoomHostCapacities: capacities },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("zoomHost");
    expect(conflicts[0].value).toBe(host);
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("merges a continuous overlap chain with two separate peaks into one row", () => {
    // One transitive-overlap cluster (m2 bridges 13-20) with two distinct over-capacity
    // peaks: {m1,m2,m3} at 14-15 and {m2,m4,m5} at 18-19 — grouped like the calendar's own
    // "+N" cluster rather than one row per concurrent set.
    const conflicts = computeConflicts(
      [
        onHost("m1", "Room A", 13, 15),
        onHost("m2", "Room B", 13, 20),
        onHost("m3", "Room C", 14, 16),
        onHost("m4", "Room D", 17, 19),
        onHost("m5", "Room E", 18, 20),
      ],
      undefined,
      { zoomHostCapacities: capacities },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  it("excludes a chained meeting that is never concurrent at an over-capacity instant", () => {
    // m0 (11-13:30) chains onto the cluster through m2 but only ever overlaps one other
    // meeting at a time — it can't help resolve the 14-15 peak, so it stays off the row.
    const conflicts = computeConflicts(
      [
        onHost("m0", "Room Z", 11, 13.5),
        onHost("m1", "Room A", 13, 15),
        onHost("m2", "Room B", 14, 16),
        onHost("m3", "Room C", 14, 15),
      ],
      undefined,
      { zoomHostCapacities: capacities },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("splits back-to-back over-capacity groups into separate rows", () => {
    // 13-14 and 14-15 trios touch at 14:00 but never overlap — two clusters, two rows.
    const conflicts = computeConflicts(
      [
        onHost("a1", "Room A", 13, 14), onHost("a2", "Room B", 13, 14), onHost("a3", "Room C", 13, 14),
        onHost("b1", "Room D", 14, 15), onHost("b2", "Room E", 14, 15), onHost("b3", "Room F", 14, 15),
      ],
      undefined,
      { zoomHostCapacities: capacities },
    );

    expect(conflicts).toHaveLength(2);
    const sets = conflicts.map((row) => row.meetings.map((m) => m.mid).sort().join(","));
    expect(sets.sort()).toEqual(["a1,a2,a3", "b1,b2,b3"]);
  });

  it("counts a suspended meeting against the host's capacity", () => {
    // A suspended meeting's Zoom sync is skipped, not torn down, so its host slot is still taken.
    const suspended = { ...onHost("m1", "Room A", 19, 20), suspensions: suspendedIndefinitely };
    const conflicts = computeConflicts(
      [suspended, onHost("m2", "Room B", 19, 20), onHost("m3", "Room C", 19, 20)],
      undefined,
      { zoomHostCapacities: capacities },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("still flags a pair of meetings sharing a room while their capacity-2 host stays healthy", () => {
    const conflicts = computeConflicts(
      [onHost("m1", "Shared Room", 19, 20), onHost("m2", "Shared Room", 19, 21)],
      undefined,
      { zoomHostCapacities: capacities },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("room");
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["m1", "m2"]);
  });

  it("keeps capacity 1 for a host absent from the capacities map", () => {
    const otherHost = "basic@icr.test";
    const meetings = [
      { ...onHost("m1", "Room A", 19, 20), zoomHost: otherHost },
      { ...onHost("m2", "Room B", 19, 20), zoomHost: otherHost },
    ];
    const conflicts = computeConflicts(meetings, undefined, { zoomHostCapacities: capacities });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("zoomHost");
    expect(conflicts[0].value).toBe(otherHost);
  });

  it("evaluates capacity per occurrence, flagging only the week a third series member lands in", () => {
    const everyWeek: ConflictCandidateMeeting = {
      ...onHost("weekly-1", "Room A", 19, 20),
      isRecurring: true,
      recurrencePattern: weeklyMondayPattern,
    };
    const everyOtherWeek: ConflictCandidateMeeting = {
      ...onHost("weekly-2", "Room B", 19, 20),
      isRecurring: true,
      recurrencePattern: { ...weeklyMondayPattern, interval: 2 },
    };
    // July 20 2026 is one of everyOtherWeek's Mondays (July 6 + 14 days); July 13 is not, so
    // that week has only two concurrent meetings and must stay unflagged.
    const oneOffOnJuly20 = onHost("one-off", "Room C", 19, 20, 20);

    const conflicts = computeConflicts([everyWeek, everyOtherWeek, oneOffOnJuly20], undefined, {
      zoomHostCapacities: capacities,
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].meetings.map((m) => m.mid).sort()).toEqual(["one-off", "weekly-1", "weekly-2"]);
    expect(conflicts[0].overlap.start.toISOString()).toBe(utcDate(2026, 7, 20, 19, 0).toISOString());
  });
});

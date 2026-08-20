import { toETDateStr, exclusionInstant, trimmedEndDate, isLiveOccurrence, rootSplitMid } from "../../util/meetings/editScope";

describe("toETDateStr", () => {
  test("formats a UTC instant as its Eastern-Time calendar date", () => {
    // 2026-01-15T02:00:00Z is still 2026-01-14 in ET (EST, UTC-5).
    expect(toETDateStr(new Date("2026-01-15T02:00:00Z"))).toBe("2026-01-14");
  });
});

describe("exclusionInstant / trimmedEndDate", () => {
  test("exclusionInstant is the UTC instant of the occurrence's ET day start", () => {
    const occurrenceDate = new Date("2026-06-15T22:00:00Z"); // 6pm ET on 2026-06-15 (EDT, UTC-4)
    const instant = exclusionInstant(occurrenceDate);
    expect(toETDateStr(instant)).toBe("2026-06-15");
    // ET midnight of 2026-06-15 is 2026-06-15T04:00:00Z during EDT.
    expect(instant.toISOString()).toBe("2026-06-15T04:00:00.000Z");
  });

  test("trimmedEndDate is exactly 1ms before the occurrence's ET day start", () => {
    const occurrenceDate = new Date("2026-06-15T22:00:00Z");
    const end = trimmedEndDate(occurrenceDate);
    expect(end.getTime()).toBe(exclusionInstant(occurrenceDate).getTime() - 1);
    // So it falls on the PREVIOUS ET calendar day.
    expect(toETDateStr(end)).toBe("2026-06-14");
  });
});

describe("isLiveOccurrence", () => {
  const weeklyPattern = {
    type: "weekly",
    startDate: new Date("2026-06-01T18:00:00Z"), // a Monday
    endDate: null,
    interval: 1,
    daysOfWeek: ["Monday"],
    weekOfMonth: null,
    dayOfMonth: null,
    excludedDates: [] as Date[],
  };

  test("true for a date the weekly pattern actually produces", () => {
    expect(isLiveOccurrence(weeklyPattern, new Date("2026-06-15T18:00:00Z"))).toBe(true);
  });

  test("false for a date off the pattern's day-of-week", () => {
    expect(isLiveOccurrence(weeklyPattern, new Date("2026-06-16T18:00:00Z"))).toBe(false);
  });

  test("false for a date before the pattern's start", () => {
    expect(isLiveOccurrence(weeklyPattern, new Date("2026-05-25T18:00:00Z"))).toBe(false);
  });

  test("false for a date past the pattern's endDate", () => {
    const bounded = { ...weeklyPattern, endDate: new Date("2026-06-08T23:59:59Z") };
    expect(isLiveOccurrence(bounded, new Date("2026-06-15T18:00:00Z"))).toBe(false);
  });

  test("false for an excluded date even though it otherwise matches", () => {
    const withExclusion = { ...weeklyPattern, excludedDates: [new Date("2026-06-15T18:00:00Z")] };
    expect(isLiveOccurrence(withExclusion, new Date("2026-06-15T18:00:00Z"))).toBe(false);
  });
});

describe("rootSplitMid", () => {
  test("returns the meeting's own mid when it has never been split off", () => {
    expect(rootSplitMid({ mid: "m-1", splitFromMid: null })).toBe("m-1");
  });

  test("returns the already-recorded root, not the immediate parent's mid, for a lineage chain", () => {
    expect(rootSplitMid({ mid: "m-2-tail", splitFromMid: "m-1-root" })).toBe("m-1-root");
  });
});

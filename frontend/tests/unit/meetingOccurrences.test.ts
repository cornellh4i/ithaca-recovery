import { matchesRecurrencePattern, adjustOccurrenceToDate } from "../../util/meetings/meetingOccurrences";
import { convertETToUTC } from "../../util/date/timeUtils";

// startDate/localDate are UTC-midnight-anchored representations of an ET
// calendar date (not real UTC instants of the meeting's actual start time) —
// matches the contract documented on IRecurrencePattern.startDate in models.ts.
const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

// excludedDates, unlike startDate/localDate, are real UTC instants of ET
// midnight (as produced by getETDayBounds() in the delete route) — isDateExcluded
// reads them back through the ET-timezone formatter, so a plain Date.UTC
// midnight would misread as the previous ET day and never match.
const etMidnightUTC = (etDateStr: string) => new Date(convertETToUTC(`${etDateStr}T00:00:00`));

const weeklyBase = {
  type: "weekly",
  startDate: utcDate(2026, 7, 6), // a Monday
  endDate: null,
  interval: 1,
  daysOfWeek: ["Monday"],
  weekOfMonth: null,
  dayOfMonth: null,
  excludedDates: [],
};

describe("matchesRecurrencePattern — weekly", () => {
  it("matches the start date itself", () => {
    expect(matchesRecurrencePattern(weeklyBase, "2026-07-06", utcDate(2026, 7, 6))).toBe(true);
  });

  it("matches a later occurrence on the same weekday", () => {
    expect(matchesRecurrencePattern(weeklyBase, "2026-07-13", utcDate(2026, 7, 13))).toBe(true);
  });

  it("does not match a different weekday", () => {
    expect(matchesRecurrencePattern(weeklyBase, "2026-07-07", utcDate(2026, 7, 7))).toBe(false);
  });

  it("does not match before the series start date", () => {
    expect(matchesRecurrencePattern(weeklyBase, "2026-06-29", utcDate(2026, 6, 29))).toBe(false);
  });

  it("respects a biweekly interval — skips the off week", () => {
    const biweekly = { ...weeklyBase, interval: 2 };
    expect(matchesRecurrencePattern(biweekly, "2026-07-13", utcDate(2026, 7, 13))).toBe(false);
    expect(matchesRecurrencePattern(biweekly, "2026-07-20", utcDate(2026, 7, 20))).toBe(true);
  });

  it("does not match past the series end date", () => {
    const withEnd = { ...weeklyBase, endDate: utcDate(2026, 7, 6) };
    expect(matchesRecurrencePattern(withEnd, "2026-07-13", utcDate(2026, 7, 13))).toBe(false);
  });

  it("does not match an excluded date", () => {
    const withExclusion = { ...weeklyBase, excludedDates: [etMidnightUTC("2026-07-13")] };
    expect(matchesRecurrencePattern(withExclusion, "2026-07-13", utcDate(2026, 7, 13))).toBe(false);
    expect(matchesRecurrencePattern(withExclusion, "2026-07-20", utcDate(2026, 7, 20))).toBe(true);
  });
});

describe("matchesRecurrencePattern — monthly", () => {
  const monthlyBase = { ...weeklyBase, type: "monthly", startDate: utcDate(2026, 7, 6) };

  it("matches a fixed day-of-month", () => {
    const pattern = { ...monthlyBase, dayOfMonth: 15, daysOfWeek: [] };
    expect(matchesRecurrencePattern(pattern, "2026-08-15", utcDate(2026, 8, 15))).toBe(true);
    expect(matchesRecurrencePattern(pattern, "2026-08-16", utcDate(2026, 8, 16))).toBe(false);
  });

  it("matches the Nth weekday of the month", () => {
    // July 6, 2026 is the 1st Monday of July.
    const pattern = { ...monthlyBase, weekOfMonth: 1, daysOfWeek: ["Monday"] };
    expect(matchesRecurrencePattern(pattern, "2026-08-03", utcDate(2026, 8, 3))).toBe(true); // 1st Mon of Aug
    expect(matchesRecurrencePattern(pattern, "2026-08-10", utcDate(2026, 8, 10))).toBe(false); // 2nd Mon of Aug
  });

  it("matches the last weekday of the month (weekOfMonth = -1)", () => {
    const pattern = { ...monthlyBase, weekOfMonth: -1, daysOfWeek: ["Monday"] };
    // Last Monday of August 2026 is the 31st.
    expect(matchesRecurrencePattern(pattern, "2026-08-31", utcDate(2026, 8, 31))).toBe(true);
    expect(matchesRecurrencePattern(pattern, "2026-08-24", utcDate(2026, 8, 24))).toBe(false);
  });

  it("respects a multi-month interval", () => {
    const pattern = { ...monthlyBase, dayOfMonth: 6, daysOfWeek: [], interval: 2 };
    expect(matchesRecurrencePattern(pattern, "2026-08-06", utcDate(2026, 8, 6))).toBe(false); // +1 month
    expect(matchesRecurrencePattern(pattern, "2026-09-06", utcDate(2026, 9, 6))).toBe(true); // +2 months
  });
});

describe("adjustOccurrenceToDate", () => {
  it("keeps a same-day meeting anchored to the target date", () => {
    const meeting = {
      startDateTime: new Date(convertETToUTC("2026-07-06T09:00:00")),
      endDateTime: new Date(convertETToUTC("2026-07-06T10:00:00")),
    };
    const { start, end } = adjustOccurrenceToDate(meeting, "2026-08-10");
    expect(start.toISOString()).toBe(new Date(convertETToUTC("2026-08-10T09:00:00")).toISOString());
    expect(end.toISOString()).toBe(new Date(convertETToUTC("2026-08-10T10:00:00")).toISOString());
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it("rolls an overnight meeting's end onto the next ET calendar day", () => {
    const meeting = {
      startDateTime: new Date(convertETToUTC("2026-07-06T23:30:00")),
      endDateTime: new Date(convertETToUTC("2026-07-07T00:30:00")), // already overnight in the original occurrence
    };
    const { start, end } = adjustOccurrenceToDate(meeting, "2026-08-10");
    expect(start.toISOString()).toBe(new Date(convertETToUTC("2026-08-10T23:30:00")).toISOString());
    expect(end.toISOString()).toBe(new Date(convertETToUTC("2026-08-11T00:30:00")).toISOString());
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it("rolls the overnight end across a month boundary", () => {
    const meeting = {
      startDateTime: new Date(convertETToUTC("2026-07-06T23:00:00")),
      endDateTime: new Date(convertETToUTC("2026-07-07T01:00:00")),
    };
    const { start, end } = adjustOccurrenceToDate(meeting, "2026-08-31");
    expect(start.toISOString()).toBe(new Date(convertETToUTC("2026-08-31T23:00:00")).toISOString());
    expect(end.toISOString()).toBe(new Date(convertETToUTC("2026-09-01T01:00:00")).toISOString());
  });
});

import {
  convertUTCToET,
  convertETToUTC,
  getETDayBounds,
  formatETDateString,
  formatETWeekdayShort,
  formatETWeekdayLong,
  formatETLongDate,
  getETDayOfMonth,
  getETDayOfWeek,
  getETTimeOfDay,
} from "../../util/date/timeUtils";

describe("convertETToUTC / convertUTCToET round-trip", () => {
  it("round-trips a summer (EDT, UTC-4) date", () => {
    const utc = convertETToUTC("2026-07-15T14:00:00");
    expect(convertUTCToET(utc)).toContain("07/15/2026, 02:00:00 PM");
  });

  it("round-trips a winter (EST, UTC-5) date", () => {
    const utc = convertETToUTC("2026-01-15T14:00:00");
    expect(convertUTCToET(utc)).toContain("01/15/2026, 02:00:00 PM");
  });
});

describe("getETDayBounds", () => {
  it("returns a 24-hour ET day as UTC instants", () => {
    const [start, end] = getETDayBounds("2026-07-15");
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(24, 1);
  });
});

describe("formatETDateString", () => {
  it("does not roll to the next day for a late-evening ET instant", () => {
    // 11:30 PM ET on 2026-07-15 is already 2026-07-16 in UTC — formatETDateString
    // must read the ET calendar date, not naively slice the UTC ISO string.
    const lateEveningUTC = new Date(convertETToUTC("2026-07-15T23:30:00"));
    expect(formatETDateString(lateEveningUTC)).toBe("2026-07-15");
  });
});

describe("formatETWeekdayShort / formatETWeekdayLong", () => {
  it("reads the ET weekday, not the UTC weekday, for a late-evening ET instant", () => {
    // 11:30 PM ET Wednesday 2026-07-15 is already Thursday in UTC.
    const lateEveningUTC = new Date(convertETToUTC("2026-07-15T23:30:00"));
    expect(formatETWeekdayShort(lateEveningUTC)).toBe("Wed");
    expect(formatETWeekdayLong(lateEveningUTC)).toBe("Wednesday");
  });
});

describe("formatETLongDate", () => {
  it("formats an ET calendar date in prose form", () => {
    const utc = convertETToUTC("2026-08-14T10:00:00");
    expect(formatETLongDate(new Date(utc))).toBe("August 14, 2026");
  });
});

describe("getETDayOfMonth", () => {
  it("reads the ET day-of-month, not the UTC day-of-month, for a late-evening ET instant", () => {
    const lateEveningUTC = new Date(convertETToUTC("2026-07-15T23:30:00"));
    expect(getETDayOfMonth(lateEveningUTC)).toBe(15);
  });
});

describe("getETDayOfWeek", () => {
  it("returns 0-6 (Sunday-Saturday) matching the ET calendar day", () => {
    // 2026-07-15 is a Wednesday.
    const utc = convertETToUTC("2026-07-15T10:00:00");
    expect(getETDayOfWeek(new Date(utc))).toBe(3);
  });

  it("reads the ET weekday, not the UTC weekday, for a late-evening ET instant", () => {
    // 11:30 PM ET Wednesday is already Thursday (4) in UTC -- must still read 3 (Wed).
    const lateEveningUTC = new Date(convertETToUTC("2026-07-15T23:30:00"));
    expect(getETDayOfWeek(lateEveningUTC)).toBe(3);
  });
});

describe("getETTimeOfDay", () => {
  it("returns the ET wall-clock hour/minute/second across a summer (EDT) instant", () => {
    const utc = convertETToUTC("2026-07-15T14:30:45");
    expect(getETTimeOfDay(new Date(utc))).toEqual({ hour: 14, minute: 30, second: 45 });
  });

  it("returns the ET wall-clock hour/minute/second across a winter (EST) instant", () => {
    const utc = convertETToUTC("2026-01-15T09:05:02");
    expect(getETTimeOfDay(new Date(utc))).toEqual({ hour: 9, minute: 5, second: 2 });
  });
});

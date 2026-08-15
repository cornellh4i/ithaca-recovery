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
  getWeekDatesET,
  parseMMDDYYYY,
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

describe("getWeekDatesET", () => {
  it("returns the 7 ET calendar dates (Sunday-Saturday) for the week containing the given date", () => {
    // 2026-07-30 is a Thursday; its week runs Sun 2026-07-26 through Sat 2026-08-01.
    expect(getWeekDatesET("2026-07-30")).toEqual([
      "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29",
      "2026-07-30", "2026-07-31", "2026-08-01",
    ]);
  });

  it("handles a month boundary correctly", () => {
    // 2026-08-03 is a Monday; its week starts in the prior month.
    expect(getWeekDatesET("2026-08-03")).toEqual([
      "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05",
      "2026-08-06", "2026-08-07", "2026-08-08",
    ]);
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

describe("parseMMDDYYYY", () => {
  it("parses a zero-padded date to ET midnight", () => {
    const parsed = parseMMDDYYYY("08/15/2026");
    expect(parsed).not.toBeNull();
    expect(formatETDateString(parsed!)).toBe("2026-08-15");
    expect(getETTimeOfDay(parsed!)).toEqual({ hour: 0, minute: 0, second: 0 });
  });

  it("tolerates unpadded month/day", () => {
    expect(formatETDateString(parseMMDDYYYY("9/5/2026")!)).toBe("2026-09-05");
  });

  it("returns null for an empty value", () => {
    expect(parseMMDDYYYY("")).toBeNull();
  });

  // Date.UTC silently normalizes an out-of-range day into the following month (Feb 30 -> Mar 2)
  // instead of failing -- parseMMDDYYYY must catch that itself rather than returning the wrong
  // real date for calendar-invalid input.
  it("rejects an invalid day for the given month", () => {
    expect(parseMMDDYYYY("02/30/2026")).toBeNull();
  });

  it("rejects an out-of-range month", () => {
    expect(parseMMDDYYYY("13/01/2026")).toBeNull();
  });

  it("accepts Feb 29 on a leap year but rejects it on a non-leap year", () => {
    expect(formatETDateString(parseMMDDYYYY("02/29/2028")!)).toBe("2028-02-29");
    expect(parseMMDDYYYY("02/29/2026")).toBeNull();
  });
});

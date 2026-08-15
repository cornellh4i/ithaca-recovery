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
  toETDateString,
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

describe("convertETToUTC DST transitions", () => {
  // Spring-forward: 2nd Sunday of March 2026 is March 8; clocks jump 1:59:59 -> 3:00:00 AM ET,
  // so 2:00-2:59 AM ET doesn't exist that day.
  it("throws for a time in the spring-forward gap", () => {
    expect(() => convertETToUTC("2026-03-08T02:30:00")).toThrow(/spring-forward gap/);
  });

  it("throws for the first instant of the spring-forward gap", () => {
    expect(() => convertETToUTC("2026-03-08T02:00:00")).toThrow(/spring-forward gap/);
  });

  it("throws for the last instant of the spring-forward gap", () => {
    expect(() => convertETToUTC("2026-03-08T02:59:59")).toThrow(/spring-forward gap/);
  });

  it("still converts the times immediately surrounding the spring-forward gap", () => {
    // 1:59:59 AM EST (UTC-5) and 3:00:00 AM EDT (UTC-4) are both real, unambiguous instants.
    expect(convertETToUTC("2026-03-08T01:59:59")).toBe("2026-03-08T06:59:59.000Z");
    expect(convertETToUTC("2026-03-08T03:00:00")).toBe("2026-03-08T07:00:00.000Z");
  });

  // Fall-back: 1st Sunday of November 2026 is November 1; clocks fall back 1:59:59 -> 1:00:00
  // AM ET, so 1:00-1:59 AM ET occurs twice (once EDT, once EST).
  it("resolves a fall-back-ambiguous time to the earlier (EDT) occurrence", () => {
    // 1:30 AM EDT (UTC-4) is 05:30 UTC; the later 1:30 AM EST (UTC-5) occurrence would be
    // 06:30 UTC -- convertETToUTC must deterministically pick the earlier one.
    expect(convertETToUTC("2026-11-01T01:30:00")).toBe("2026-11-01T05:30:00.000Z");
  });

  it("resolves the first and last instants of the fall-back overlap to their earlier occurrence", () => {
    expect(convertETToUTC("2026-11-01T01:00:00")).toBe("2026-11-01T05:00:00.000Z");
    expect(convertETToUTC("2026-11-01T01:59:59")).toBe("2026-11-01T05:59:59.000Z");
  });

  it("still converts the times immediately surrounding the fall-back overlap unambiguously", () => {
    expect(convertETToUTC("2026-11-01T00:59:59")).toBe("2026-11-01T04:59:59.000Z");
    // 2:00 AM ET is already back to a single (EST) occurrence once the overlap hour ends.
    expect(convertETToUTC("2026-11-01T02:00:00")).toBe("2026-11-01T07:00:00.000Z");
  });

  it("rejects a calendar-invalid date instead of silently rolling it over", () => {
    expect(() => convertETToUTC("2026-02-30T00:00:00")).toThrow(/not a valid calendar date/);
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

describe("toETDateString", () => {
  it("passes a plain YYYY-MM-DD string through unchanged", () => {
    expect(toETDateString("2026-08-15")).toBe("2026-08-15");
  });

  it("normalises a full ISO string to its ET calendar date", () => {
    expect(toETDateString(convertETToUTC("2026-08-15T23:30:00"))).toBe("2026-08-15");
  });

  // Date.UTC would otherwise silently normalize an invalid day/month into a different,
  // valid date (e.g. Feb 31 -> Mar 3) instead of failing.
  it("rejects a YYYY-MM-DD-shaped string that isn't a real calendar date", () => {
    expect(() => toETDateString("2026-02-31")).toThrow(/not a valid calendar date/);
  });

  it("rejects an unparseable date string", () => {
    expect(() => toETDateString("not-a-date")).toThrow();
  });
});

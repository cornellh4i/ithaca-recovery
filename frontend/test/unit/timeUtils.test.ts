import { convertUTCToET, convertETToUTC, getETDayBounds, formatETDateString } from "../../util/timeUtils";

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

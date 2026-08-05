import { getFirstDayOfWeek, getDaysOfWeek, daysBetweenET } from "../../util/weekDates";
import { formatETDateString } from "../../util/timeUtils";

const utcNoon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16, 0)); // ~noon ET

describe("getFirstDayOfWeek", () => {
  it("returns the same Sunday when given a Sunday", () => {
    const sunday = utcNoon(2026, 7, 26); // a Sunday
    expect(formatETDateString(getFirstDayOfWeek(sunday))).toBe("2026-07-26");
  });

  it("returns the preceding Sunday when given a mid-week date", () => {
    const thursday = utcNoon(2026, 7, 30); // a Thursday
    expect(formatETDateString(getFirstDayOfWeek(thursday))).toBe("2026-07-26");
  });

  it("returns the preceding Sunday when given a Saturday", () => {
    const saturday = utcNoon(2026, 8, 1);
    expect(formatETDateString(getFirstDayOfWeek(saturday))).toBe("2026-07-26");
  });

  it("handles a month boundary correctly", () => {
    const date = utcNoon(2026, 8, 3); // a Monday, week starts in the prior month
    expect(formatETDateString(getFirstDayOfWeek(date))).toBe("2026-08-02");
  });
});

describe("getDaysOfWeek", () => {
  it("returns 7 consecutive ET calendar dates starting from the given date", () => {
    const sunday = utcNoon(2026, 7, 26);
    const days = getDaysOfWeek(sunday).map(formatETDateString);

    expect(days).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
  });
});

describe("daysBetweenET", () => {
  it("returns 0 for the same ET calendar day", () => {
    expect(daysBetweenET(utcNoon(2026, 7, 26), utcNoon(2026, 7, 26))).toBe(0);
  });

  it("returns a positive count when b is later than a", () => {
    expect(daysBetweenET(utcNoon(2026, 7, 26), utcNoon(2026, 8, 1))).toBe(6);
  });

  it("returns a negative count when b is earlier than a", () => {
    expect(daysBetweenET(utcNoon(2026, 8, 1), utcNoon(2026, 7, 26))).toBe(-6);
  });

  it("handles a month boundary correctly", () => {
    expect(daysBetweenET(utcNoon(2026, 7, 30), utcNoon(2026, 8, 3))).toBe(4);
  });
});

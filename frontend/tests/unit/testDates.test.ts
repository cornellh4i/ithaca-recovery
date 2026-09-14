import { addETDays, etInstant, firstETWeekdayOnOrAfter, nextETWeekday, todayETDateString } from "../factories/dates";
import { formatETDateString, formatETWeekdayLong } from "../../util/date/timeUtils";

// tests/factories/dates.ts is the anchor every linked-schedule fixture now derives from, so an
// off-by-one here would move those suites' expectations rather than fail loudly.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const utcMidnight = (etDate: string) => {
  const [year, month, day] = etDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

describe("addETDays", () => {
  it("advances exactly one calendar day across both 2026 DST transitions", () => {
    expect(addETDays("2026-03-07", 1)).toBe("2026-03-08"); // spring forward
    expect(addETDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addETDays("2026-10-31", 1)).toBe("2026-11-01"); // fall back
    expect(addETDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("crosses month and year boundaries", () => {
    expect(addETDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addETDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addETDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("firstETWeekdayOnOrAfter", () => {
  it("returns that weekday, never more than six days out, for every weekday across a DST week", () => {
    let cursor = "2026-03-05";
    for (let day = 0; day < 10; day++) {
      for (const weekday of WEEKDAYS) {
        const hit = firstETWeekdayOnOrAfter(weekday, cursor);
        expect(formatETWeekdayLong(etInstant(hit, "12:00:00"))).toBe(weekday);
        const delta = (utcMidnight(hit) - utcMidnight(cursor)) / 86_400_000;
        expect(delta).toBeGreaterThanOrEqual(0);
        expect(delta).toBeLessThanOrEqual(6);
      }
      cursor = addETDays(cursor, 1);
    }
  });

  it("returns the date itself when it already is that weekday", () => {
    expect(firstETWeekdayOnOrAfter("Sunday", "2026-03-08")).toBe("2026-03-08");
  });
});

describe("etInstant", () => {
  it("stays on the given ET date at both ends of the day", () => {
    for (const etDate of ["2026-03-08", "2026-11-01", "2026-06-15"]) {
      expect(formatETDateString(etInstant(etDate, "00:00:00"))).toBe(etDate);
      expect(formatETDateString(etInstant(etDate, "23:59:00"))).toBe(etDate);
    }
  });
});

describe("nextETWeekday", () => {
  it("is always strictly in the future, which is what the fixtures rely on", () => {
    for (const weekday of WEEKDAYS) {
      const hit = nextETWeekday(weekday);
      expect(formatETWeekdayLong(etInstant(hit, "12:00:00"))).toBe(weekday);
      expect(utcMidnight(hit)).toBeGreaterThan(utcMidnight(todayETDateString()));
    }
  });
});

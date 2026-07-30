import { toRRule } from "../../services/googleCalendar";
import { IRecurrencePattern } from "../../util/models";

const base: IRecurrencePattern = {
  type: "weekly",
  startDate: new Date("2026-07-01T00:00:00Z"),
  firstDayOfWeek: "Sunday",
  interval: 1,
  daysOfWeek: ["Monday"],
};

describe("toRRule — weekly", () => {
  it("builds a basic weekly BYDAY rule", () => {
    expect(toRRule(base)).toBe("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO");
  });

  it("supports a biweekly interval", () => {
    expect(toRRule({ ...base, interval: 2 })).toBe("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO");
  });

  it("prefers numberOfOccurrences (COUNT) over endDate when both are set", () => {
    const rule = toRRule({
      ...base,
      numberOfOccurrences: 5,
      endDate: new Date("2026-12-31T00:00:00Z"),
    });
    expect(rule).toContain("COUNT=5");
    expect(rule).not.toContain("UNTIL");
  });

  it("uses UNTIL, inclusive of the full ET end date, when only endDate is set", () => {
    // Noon UTC unambiguously falls on July 15 in ET (UTC midnight would actually
    // read back as July 14 ET — a real footgun this function itself guards against).
    const rule = toRRule({ ...base, endDate: new Date("2026-07-15T12:00:00Z") });
    // 23:59:59 ET on 2026-07-15 (EDT, UTC-4) is 2026-07-16T03:59:59Z.
    expect(rule).toBe("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=20260716T035959Z");
  });

  it("has no COUNT/UNTIL when neither is set", () => {
    expect(toRRule(base)).not.toMatch(/COUNT|UNTIL/);
  });
});

describe("toRRule — monthly", () => {
  it("builds a fixed day-of-month rule", () => {
    const rule = toRRule({ ...base, type: "monthly", dayOfMonth: 15 });
    expect(rule).toBe("RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15");
  });

  it("builds an Nth-weekday-of-month rule", () => {
    const rule = toRRule({ ...base, type: "monthly", weekOfMonth: 2, daysOfWeek: ["Tuesday"] });
    expect(rule).toBe("RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU");
  });

  it("uses -1 for 'last weekday of month'", () => {
    const rule = toRRule({ ...base, type: "monthly", weekOfMonth: -1, daysOfWeek: ["Friday"] });
    expect(rule).toBe("RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR");
  });
});

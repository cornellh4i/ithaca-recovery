import { toRRule, reconcileMeetingCalendars } from "../../services/googleCalendar";
import { IMeeting, IRecurrencePattern } from "../../util/models";

const base: IRecurrencePattern = {
  type: "weekly",
  startDate: new Date("2026-07-01T00:00:00Z"),
  firstDayOfWeek: "Sunday",
  interval: 1,
  daysOfWeek: ["Monday"],
};

function buildMeeting(overrides: Partial<IMeeting> = {}): IMeeting {
  return {
    mid: "m-test",
    title: "Test Meeting",
    description: "",
    creator: "Creator",
    group: "Group",
    startDateTime: new Date("2026-08-01T18:00:00Z"),
    endDateTime: new Date("2026-08-01T19:00:00Z"),
    email: "test@test.icr",
    calType: ["AA"],
    modeType: "In Person",
    room: "Serenity Room",
    isRecurring: false,
    ...overrides,
  };
}

// No GOOGLE_CALENDAR_* env vars are set in the unit-test environment (no .env loaded here),
// so calendarIdForCategory resolves every real category ("AA", "Al-Anon", "Other") to "" --
// exactly the "all calendars commented out" misconfiguration this regression test locks in.
// Every scenario below is deliberately chosen so calendarIds never resolves a real ID, which
// keeps both of reconcileMeetingCalendars' internal loops as no-ops -- no real Google Calendar
// API call is ever attempted, so these stay fast, deterministic, network-free unit tests.
describe("reconcileMeetingCalendars", () => {
  const FAKE_TOKEN = "fake-access-token";

  it("reports allSynced: false when every requested calType category is unconfigured", async () => {
    const meeting = buildMeeting({ calType: ["AA"] });
    const { allSynced, updatedEventIds } = await reconcileMeetingCalendars(FAKE_TOKEN, meeting, {});

    expect(allSynced).toBe(false);
    expect(updatedEventIds).toEqual({});
  });

  it("reports allSynced: false when multiple requested categories are all unconfigured", async () => {
    // Regression coverage for the exact bug found in production: with every category
    // unconfigured, calendarIds resolves to {} and both loops below never run -- allSynced
    // must not be left at its vacuously-true initial value.
    const meeting = buildMeeting({ calType: ["AA", "Other"] });
    const { allSynced } = await reconcileMeetingCalendars(FAKE_TOKEN, meeting, {});

    expect(allSynced).toBe(false);
  });

  it("reports allSynced: true when calType is empty -- nothing to sync isn't a failure", async () => {
    const meeting = buildMeeting({ calType: [] });
    const { allSynced } = await reconcileMeetingCalendars(FAKE_TOKEN, meeting, {});

    expect(allSynced).toBe(true);
  });

  it("drops a stale event for a category that's no longer configured, without failing the meeting", async () => {
    // The category itself isn't part of calType anymore (or never resolves), so there's
    // nothing to actively delete it from -- the stale mapping is just forgotten, and that
    // alone shouldn't count as a sync failure.
    const meeting = buildMeeting({ calType: [] });
    const { allSynced, updatedEventIds } = await reconcileMeetingCalendars(
      FAKE_TOKEN,
      meeting,
      { Other: "stale-event-id" },
    );

    expect(allSynced).toBe(true);
    expect(updatedEventIds).toEqual({});
  });
});

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

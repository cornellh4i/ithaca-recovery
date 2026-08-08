import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { disconnectTestPrismaClient } from "../factories/db";
import { getMeetingsForRange } from "../../util/meetingOccurrences";
import { convertETToUTC, addDaysToETDateString, formatETDateString } from "../../util/date/timeUtils";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

const weekdayOf = (etDateStr: string): string =>
  new Date(convertETToUTC(`${etDateStr}T12:00:00`)).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });

const ALL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

test("expands a weekly recurring meeting across a 7-day range", async () => {
  const today = formatETDateString(new Date());
  const { meeting } = await seedRecurringMeeting(
    { title: "Weekly Range Meeting", startDateTime: new Date(convertETToUTC(`${today}T18:00:00`)), endDateTime: new Date(convertETToUTC(`${today}T19:00:00`)) },
    { daysOfWeek: ALL_DAYS },
  );

  const rangeEnd = addDaysToETDateString(today, 6);
  const results = await getMeetingsForRange(today, rangeEnd);
  const own = results.filter(r => r.mid === meeting.mid);
  expect(own.length).toBe(7);
  expect(new Set(own.map(r => r.date)).size).toBe(7);
});

test("excludes a recurring series whose span doesn't overlap the range", async () => {
  const farFuture = formatETDateString(new Date(Date.now() + 1000 * 60 * 60 * 24 * 400));
  const { meeting } = await seedRecurringMeeting(
    { title: "Far Future Range Meeting", startDateTime: new Date(convertETToUTC(`${farFuture}T18:00:00`)), endDateTime: new Date(convertETToUTC(`${farFuture}T19:00:00`)) },
    { startDate: new Date(convertETToUTC(`${farFuture}T18:00:00`)), daysOfWeek: ALL_DAYS },
  );

  const today = formatETDateString(new Date());
  const rangeEnd = addDaysToETDateString(today, 6);
  const results = await getMeetingsForRange(today, rangeEnd);
  expect(results.some(r => r.mid === meeting.mid)).toBe(false);
});

test("includes a one-time meeting only on the day it overlaps", async () => {
  const today = formatETDateString(new Date());
  const tomorrow = addDaysToETDateString(today, 1);
  const meeting = await seedMeeting({
    title: "One Time Range Meeting",
    startDateTime: new Date(convertETToUTC(`${tomorrow}T10:00:00`)),
    endDateTime: new Date(convertETToUTC(`${tomorrow}T11:00:00`)),
  });

  const rangeEnd = addDaysToETDateString(today, 6);
  const results = await getMeetingsForRange(today, rangeEnd);
  const own = results.filter(r => r.mid === meeting.mid);
  expect(own.length).toBe(1);
  expect(own[0].date).toBe(tomorrow);
});

test("doesn't double-count an overnight recurring meeting on its own anchor day", async () => {
  const today = formatETDateString(new Date());
  const { meeting } = await seedRecurringMeeting(
    { title: "Overnight Anchor Meeting", startDateTime: new Date(convertETToUTC(`${today}T23:30:00`)), endDateTime: new Date(convertETToUTC(`${addDaysToETDateString(today, 1)}T00:30:00`)) },
    { daysOfWeek: ALL_DAYS },
  );

  const rangeEnd = addDaysToETDateString(today, 6);
  const results = await getMeetingsForRange(today, rangeEnd);
  const own = results.filter(r => r.mid === meeting.mid);
  expect(own.length).toBe(7);
  expect(new Set(own.map(r => r.date)).size).toBe(7);
});

test("catches a non-anchor overnight occurrence spilling in from the day before the range", async () => {
  const today = formatETDateString(new Date());
  // rangeStart is queried alone (a 1-day range) so the "lead-in day" (rangeStart - 1) is the
  // only day whose pattern match matters -- rangeStart itself is a different weekday, so it
  // won't also match and produce a second, unrelated occurrence to disambiguate from.
  const rangeStart = addDaysToETDateString(today, 10);
  const leadInDay = addDaysToETDateString(rangeStart, -1);
  // The meeting's own literal DB row is anchored 2 weeks before the lead-in day -- far outside
  // [rangeStart, rangeStart], so directlyScheduledMeetings can't be what catches this; only the
  // pattern-matched (non-anchor) expansion for a *later* week's occurrence can.
  const anchorDay = addDaysToETDateString(leadInDay, -14);

  const { meeting } = await seedRecurringMeeting(
    { title: "Non-Anchor Overnight Spillover Meeting", startDateTime: new Date(convertETToUTC(`${anchorDay}T23:30:00`)), endDateTime: new Date(convertETToUTC(`${addDaysToETDateString(anchorDay, 1)}T00:30:00`)) },
    { startDate: new Date(convertETToUTC(`${anchorDay}T23:30:00`)), daysOfWeek: [weekdayOf(anchorDay)] },
  );

  const results = await getMeetingsForRange(rangeStart, rangeStart);
  const own = results.filter(r => r.mid === meeting.mid);
  expect(own.length).toBe(1);
  expect(own[0].date).toBe(rangeStart);
});

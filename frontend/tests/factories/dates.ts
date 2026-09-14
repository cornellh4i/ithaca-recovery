import { convertETToUTC, formatETDateString, formatETWeekdayLong } from "../../util/date/timeUtils";

/**
 * ET calendar-date arithmetic for test fixtures that must stay valid as the calendar moves.
 *
 * Any suite asserting on a derived recurrence date needs these rather than a pinned date
 * string: several derivations clamp to today (see deriveLinkedScheduleTiming in
 * util/meetings/linkedSchedules.ts), so a date written as "a real future Monday" stops being
 * one, and the resulting failure reads as a routing bug rather than an expired fixture.
 */

/** Today's ET calendar date, as yyyy-mm-dd. */
export function todayETDateString(): string {
  return formatETDateString(new Date());
}

/** `etDate` shifted by whole ET calendar days. */
export function addETDays(etDate: string, days: number): string {
  const [year, month, day] = etDate.split("-").map(Number);
  // 16:00 UTC is the same ET calendar day under either offset, so stepping in whole UTC days
  // reads back as consecutive ET dates across a DST change.
  return formatETDateString(new Date(Date.UTC(year, month - 1, day + days, 16)));
}

/** The first `weekday` on or after `etDate`. */
export function firstETWeekdayOnOrAfter(weekday: string, etDate: string): string {
  let cursor = etDate;
  for (let i = 0; i < 7; i++) {
    if (formatETWeekdayLong(etInstant(cursor, "12:00:00")) === weekday) return cursor;
    cursor = addETDays(cursor, 1);
  }
  throw new Error(`No ${weekday} within a week of ${etDate}`);
}

/** The first `weekday` strictly after today -- the usual anchor for a "future" series start. */
export function nextETWeekday(weekday: string): string {
  return firstETWeekdayOnOrAfter(weekday, addETDays(todayETDateString(), 1));
}

/** The instant at an ET wall-clock `time` ("HH:MM:SS") on `etDate`. */
export function etInstant(etDate: string, time: string): Date {
  return new Date(convertETToUTC(`${etDate}T${time}`));
}

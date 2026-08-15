/**
 * Converts a UTC date string to the Eastern Time format; accounts for Daylight Savings
 * @param utcDateString - UTC date string to be converted (in ISO 8601 format).
 * @returns corresponding ET date string, formatted as MM/DD/YYYY, hh:mm:ss AM/PM.
 */
export const convertUTCToET = (utcDateString: string): string => {
  const utcDate = new Date(utcDateString);

  if (isNaN(utcDate.getTime())) {
    throw new Error('Invalid UTC date string');
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true 
  };

  const estDate = utcDate.toLocaleString('en-US', options);
  
  return estDate;
};

// ET wall-clock reading (year/month/day/hour/minute/second) of a UTC instant, as plain
// numbers -- shared by convertETToUTC's offset search below. hour % 24 guards against ICU
// builds that render midnight as "24" under hour12: false.
const getETPartsAt = (ms: number) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find(p => p.type === type)?.value ?? '0');
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour') % 24, minute: get('minute'), second: get('second'),
  };
};

/**
 * Converts an ET date string to UTC.
 * Handles DST automatically — works regardless of the host machine's local timezone.
 *
 * DST edge cases (America/New_York only ever runs EDT, UTC-4, or EST, UTC-5):
 * - Spring-forward gap (2nd Sunday of March, ~2:00-2:59 AM ET): that wall-clock time never
 *   occurs (clocks jump 1:59:59 -> 3:00:00) -- throws rather than silently returning a UTC
 *   instant that doesn't actually correspond to the requested local time.
 * - Fall-back overlap (1st Sunday of November, ~1:00-1:59 AM ET): that wall-clock time occurs
 *   twice. Resolves to the earlier (EDT) occurrence, matching Java's ZonedDateTime default for
 *   an ambiguous local time -- there's no disambiguation parameter, since real callers only
 *   ever pass meeting times, which are never scheduled in this 1-hour window.
 *
 * @param etDateString - ET date string in "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" format
 * @returns corresponding UTC date string in ISO 8601 format
 * @throws if the date part isn't a valid calendar date, or the time falls in the DST
 *   spring-forward gap
 */
export const convertETToUTC = (etDateString: string): string => {
  const [datePart, timePart = '00:00:00'] = etDateString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);

  // Reject a calendar-invalid date (e.g. Feb 30) up front, rather than letting Date.UTC
  // silently roll it into a different, valid date further down.
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    throw new Error(`convertETToUTC: "${etDateString}" is not a valid calendar date`);
  }

  // Treat the target wall-clock values as if they were already UTC, then try both of
  // America/New_York's possible offsets (EDT/UTC-4, EST/UTC-5) and keep whichever one reads
  // back as the exact target ET wall time. Outside the two DST-transition windows, exactly one
  // candidate round-trips.
  const targetAsUTCMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const candidates = [4, 5].map(offsetHours => targetAsUTCMs + offsetHours * 3_600_000);
  const valid = candidates.filter(ms => {
    const p = getETPartsAt(ms);
    return p.year === year && p.month === month && p.day === day
      && p.hour === hour && p.minute === minute && p.second === second;
  });

  if (valid.length === 0) {
    throw new Error(
      `convertETToUTC: "${etDateString}" falls in the DST spring-forward gap and does not exist in America/New_York`,
    );
  }

  // valid.length === 2 means the fall-back overlap applies -- Math.min picks the earlier (EDT)
  // occurrence, per the documented rule above. valid.length === 1 just returns that instant.
  return new Date(Math.min(...valid)).toISOString();
};

/**
 * Returns the UTC start (midnight ET) and end (23:59:59.999 ET) for a given
 * ET calendar date.  Use this for day-boundary queries so DST is handled
 * correctly without hardcoded hour offsets.
 *
 * @param etDateStr - Calendar date in "YYYY-MM-DD" format (interpreted as ET)
 * @returns [startOfDay, endOfDay] as UTC Date objects
 */
export const getETDayBounds = (etDateStr: string): [Date, Date] => {
  const start = new Date(convertETToUTC(`${etDateStr}T00:00:00`));
  const end = new Date(convertETToUTC(`${etDateStr}T23:59:59`));
  end.setUTCMilliseconds(999);
  return [start, end];
};

// en-CA formats as "YYYY-MM-DD", which is what we want directly out of Intl.
const etDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * ET calendar date ("YYYY-MM-DD") for a given instant — not `.toISOString().slice(0,10)`,
 * which reads the UTC date and rolls a day ahead for evening ET instants.
 */
export const formatETDateString = (date: Date): string => etDateFmt.format(date);

// Short weekday label ("Mon"), pinned ET -- callers apply their own case/substring
// (e.g. WeekView uppercases it, MiniCalendar takes just the first letter).
const etWeekdayShortFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short',
});

/** ET short weekday label (e.g. "Mon") for a given instant. */
export const formatETWeekdayShort = (date: Date): string => etWeekdayShortFmt.format(date);

// Full weekday label ("Monday"), pinned ET -- e.g. for matching against a recurrence
// pattern's daysOfWeek, which stores full names.
const etWeekdayLongFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'long',
});

/** ET full weekday label (e.g. "Monday") for a given instant. */
export const formatETWeekdayLong = (date: Date): string => etWeekdayLongFmt.format(date);

// "August 14, 2026" -- pinned ET, for prose date display (e.g. suspension status text).
const etLongDateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
});

/** ET long-form prose date (e.g. "August 14, 2026") for a given instant. */
export const formatETLongDate = (date: Date): string => etLongDateFmt.format(date);

/** ET day-of-month (1-31) for a given instant. */
export const getETDayOfMonth = (date: Date): number => Number(formatETDateString(date).slice(-2));

/**
 * ET "YYYY-MM-DD" calendar date as a UTC millisecond timestamp -- Date.UTC used purely as a
 * proleptic-Gregorian calendar calculator (never a real timezone conversion), for calendar-day
 * arithmetic (day-of-week, day differences) that only cares about relative calendar position.
 * The single canonical implementation of this idiom -- getETDayOfWeek, getWeekDatesET below,
 * and weekDates.ts's daysBetweenET all build on this instead of each re-deriving it.
 */
export const getETCalendarDateMs = (etDateStr: string): number => {
  const [year, month, day] = etDateStr.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

/** ET day of week (0 = Sunday .. 6 = Saturday) for a given instant. */
export const getETDayOfWeek = (date: Date): number =>
  new Date(getETCalendarDateMs(formatETDateString(date))).getUTCDay();

/**
 * Parses a DatePicker field's MM/DD/YYYY value into a UTC Date at ET midnight for that day, or
 * null for an empty/unparseable value. Tolerates unpadded month/day -- DatePicker's onChange
 * can forward the user's raw typed text (e.g. "1/5/2026"), not just its zero-padded output.
 * Goes through convertETToUTC (same as getETDayBounds above) rather than `new Date(y, m, d)`,
 * which builds the date in the *browser's* local timezone -- for a user whose clock isn't on a
 * US zone (or is simply set to UTC), that can silently resolve to the previous ET calendar day.
 * Shared by SuspendMeetingModal, ResumeMeetingModal, and RecurringMeeting's start/end date fields.
 */
export const parseMMDDYYYY = (value: string): Date | null => {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const etDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  try {
    // convertETToUTC itself now rejects a calendar-invalid date (e.g. "02/30/2026") --
    // caught here and folded into this function's null-for-unparseable contract.
    const parsed = new Date(convertETToUTC(`${etDateStr}T00:00:00`));
    if (isNaN(parsed.getTime()) || formatETDateString(parsed) !== etDateStr) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Normalises a "startDate" request param (either a plain "YYYY-MM-DD" or a full
 * date/ISO string) into a "YYYY-MM-DD" ET calendar date string.
 *
 * @throws if `dateParam` is "YYYY-MM-DD"-shaped but not a real calendar date (e.g.
 *   "2024-02-31"), or isn't "YYYY-MM-DD"-shaped and also isn't a parseable date string at all.
 */
export const toETDateString = (dateParam: string): string => {
  const match = dateParam.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return formatETDateString(new Date(dateParam));

  const [, yearStr, monthStr, dayStr] = match;
  const [year, month, day] = [Number(yearStr), Number(monthStr), Number(dayStr)];
  const roundTripped = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTripped.getUTCFullYear() !== year ||
    roundTripped.getUTCMonth() !== month - 1 ||
    roundTripped.getUTCDate() !== day
  ) {
    throw new Error(`toETDateString: "${dateParam}" is not a valid calendar date`);
  }
  return dateParam;
};

/**
 * Returns the 7 ET calendar date strings (Sunday through Saturday) for the week
 * containing the given ET date string.
 */
export const getWeekDatesET = (etDateStr: string): string[] => {
  const dow = new Date(getETCalendarDateMs(etDateStr)).getUTCDay();
  return Array.from({ length: 7 }, (_, i) => addDaysToETDateString(etDateStr, i - dow));
};

/**
 * Adds `days` calendar days to an ET "YYYY-MM-DD" string, returning a new ET date string.
 * Date.UTC is used purely as a proleptic-Gregorian calculator here (same idiom as
 * getETCalendarDateMs above) -- the result is read back with toISOString(), never reinterpreted
 * through a real timezone, so it stays correct regardless of DST or the runtime's local zone.
 */
export const addDaysToETDateString = (etDateStr: string, days: number): string => {
  const [year, month, day] = etDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

/**
 * Number of days in the given month (1-indexed: 1 = January) of `year`, per the proleptic
 * Gregorian calendar -- Date.UTC(year, month, 0) is "day 0" of the following month, i.e. the
 * last day of `month` itself. `month` isn't clamped to 1-12: Date.UTC normalizes any integer
 * (e.g. 13 = January of `year + 1`), which addMonthsToETDateString below relies on for its own
 * year-boundary math.
 */
export const getDaysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Adds `months` calendar months to an ET "YYYY-MM-DD" string, clamping the day if the target
 * month is shorter (e.g. Jan 31 + 1 month -> Feb 28/29, not rolling into March).
 */
export const addMonthsToETDateString = (etDateStr: string, months: number): string => {
  const [year, month, day] = etDateStr.split('-').map(Number);
  const targetMonthIndex = month - 1 + months;
  const daysInTargetMonth = getDaysInMonth(year, targetMonthIndex + 1);
  return new Date(Date.UTC(year, targetMonthIndex, Math.min(day, daysInTargetMonth))).toISOString().slice(0, 10);
};

// en-GB (not en-US) specifically -- some Intl/ICU builds render en-US midnight as "24"
// instead of "00" with hour12:false, which would corrupt the minutes-since-midnight math
// below. Same pattern as ConflictList.tsx's etTimeFmt.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Current ET wall-clock time as minutes since midnight (0-1439), for computing "the next N-minute slot" defaults. */
export const getCurrentETMinutesSinceMidnight = (): number => {
  const parts = etTimeFmt.formatToParts(new Date());
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return hour * 60 + minute;
};

// Same en-GB/hour12:false reasoning as etTimeFmt above, plus seconds.
const etTimeOfDayFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/**
 * ET wall-clock hour/minute/second (24h) for a given instant -- for re-anchoring a
 * known time-of-day onto a different ET calendar date (combine with convertETToUTC).
 */
export const getETTimeOfDay = (date: Date): { hour: number; minute: number; second: number } => {
  const parts = etTimeOfDayFmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  return { hour: get('hour') % 24, minute: get('minute'), second: get('second') };
};

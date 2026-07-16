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

/**
 * Converts an ET date string to UTC.
 * Handles DST automatically — works regardless of the host machine's local timezone.
 *
 * @param etDateString - ET date string in "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" format
 * @returns corresponding UTC date string in ISO 8601 format
 */
export const convertETToUTC = (etDateString: string): string => {
  const [datePart, timePart = '00:00:00'] = etDateString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);

  // Create a UTC probe with the same numeric values as the ET input, then ask
  // Intl what ET wall time that probe corresponds to.  The difference between
  // the target ET time and the probe's ET time equals the ET→UTC offset at
  // that moment — correcting for DST automatically.
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(probe);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(etParts.find(p => p.type === type)?.value ?? '0');

  // Use the full ET datetime (including day) from Intl so that day-boundary
  // cases work correctly — e.g. UTC midnight = previous day 8 PM ET, and the
  // hours-only diff would go negative without the date component.
  const probeEtAsUTC = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  const targetEtAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  const diffMs = targetEtAsUTC - probeEtAsUTC;

  return new Date(probe.getTime() + diffMs).toISOString();
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

/**
 * Normalises a "startDate" request param (either a plain "YYYY-MM-DD" or a full
 * date/ISO string) into a "YYYY-MM-DD" ET calendar date string.
 */
export const toETDateString = (dateParam: string): string =>
  dateParam.match(/^\d{4}-\d{2}-\d{2}$/) ? dateParam : formatETDateString(new Date(dateParam));

/**
 * Returns the 7 ET calendar date strings (Sunday through Saturday) for the week
 * containing the given ET date string.
 */
export const getWeekDatesET = (etDateStr: string): string[] => {
  const [year, month, day] = etDateStr.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  const dow = base.getUTCDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, day - dow + i));
    return d.toISOString().slice(0, 10);
  });
};

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
 * Converts an EST (Eastern Standard Time) date string to UTC.
 * 
 * @param estDateString the ET date string to be converted (in MM/DD/YYYY, hh:mm:ss AM/PM format)
 * @returns corresponding UTC date string in ISO 8601 format
 */
export const convertETToUTC = (estDateString: string): string => {
  const estDate = new Date(estDateString);

  if (isNaN(estDate.getTime())) {
    throw new Error('Invalid EST date string');
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const estFormattedDate = formatter.format(estDate);

  const utcDate = new Date(estFormattedDate).toISOString();

  return utcDate;
};

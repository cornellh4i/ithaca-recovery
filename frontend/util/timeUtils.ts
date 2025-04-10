export const convertUTCToEST = (utcDateString: string): string => {
  const utcDate = new Date(utcDateString);

  if (isNaN(utcDate.getTime())) {
    throw new Error('Invalid UTC date string');
  }

  console.log("Original UTC String:", utcDateString);

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

  console.log("Converted EST String:", estDate);

  return estDate;
};

export const convertESTToUTC = (estDateString: string): string => {
  const estDate = new Date(estDateString);

  if (isNaN(estDate.getTime())) {
    throw new Error('Invalid EST date string');
  }

  // Create a new Intl.DateTimeFormat object with the America/New_York time zone
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

  // Format the date to America/New_York time zone
  const estFormattedDate = formatter.format(estDate);

  // Convert it to UTC
  const utcDate = new Date(estFormattedDate).toISOString();

  return utcDate;
};


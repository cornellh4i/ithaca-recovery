export const convertUTCToEST = (utcDateString: string): string => {
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
    };
  
    const estDate = utcDate.toLocaleString('en-US', options);
    return estDate;
};

// Convert an EST date string to UTC
export const convertESTToUTC = (estDateString: string): string => {
    const estDate = new Date(estDateString);

    if (isNaN(estDate.getTime())) {
      throw new Error('Invalid EST date string');
    }

    const utcDate = estDate.toISOString();
    return utcDate;
};

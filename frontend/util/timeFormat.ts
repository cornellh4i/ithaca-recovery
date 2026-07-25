// Shared compact time-range formatting used by both DailyView and WeeklyView meeting cards.

/** "7:00"/"8:30" (24hr "HH:MM") -> { label: "7"/"8:30", period: "AM"/"PM" } — drops :00 on the hour */
const splitHourMinute = (time: string): { label: string; period: 'AM' | 'PM' } => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const label = minutes === 0 ? `${formattedHours}` : `${formattedHours}:${minutes.toString().padStart(2, '0')}`;
    return { label, period };
};

/**
 * Compact time range from two "HH:MM" (24hr) strings: "7 - 8 AM", "7 - 8:30 AM"; both
 * periods are shown only when they differ, e.g. "11 AM - 12:30 PM".
 */
export const formatCompactTimeRange = (startTime: string, endTime: string): string => {
    const start = splitHourMinute(startTime);
    const end = splitHourMinute(endTime);
    return start.period === end.period
        ? `${start.label} - ${end.label} ${end.period}`
        : `${start.label} ${start.period} - ${end.label} ${end.period}`;
};

// Both "now" and the meeting date must go through this same explicit-zone formatter — never a
// bare `.getFullYear()`/`.toLocaleDateString()` without a zone, which would silently use the
// server/browser's local timezone instead of ET.
const etDateLineFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'long', day: 'numeric',
});
const etYearFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric',
});

/**
 * ET calendar date as "Fri, July 24", with the year appended ("Fri, July 24, 2027") only
 * when it differs from the current ET year.
 */
export const formatMeetingDateLine = (date: Date): string => {
    const base = etDateLineFmt.format(date);
    const dateYear = etYearFmt.format(date);
    const currentYear = etYearFmt.format(new Date());
    return dateYear === currentYear ? base : `${base}, ${dateYear}`;
};

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
 * Compact time range from two "HH:MM" (24hr) strings: "7-8AM", "7-8:30AM"; both
 * periods are shown only when they differ, e.g. "11AM-12:30PM".
 */
export const formatCompactTimeRange = (startTime: string, endTime: string): string => {
    const start = splitHourMinute(startTime);
    const end = splitHourMinute(endTime);
    return start.period === end.period
        ? `${start.label}-${end.label}${end.period}`
        : `${start.label}${start.period}-${end.label}${end.period}`;
};

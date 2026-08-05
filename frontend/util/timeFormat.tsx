// Shared compact time-range formatting used by both DayView and WeekView meeting cards.

import type { ReactNode } from "react";
import { formatETDateString, getWeekDatesET } from "./timeUtils";

// Matches $brand-pink-color in styles/Variables.module.scss -- Sass vars aren't importable
// into TS, so this is kept in sync manually (same pattern as CompactCalendarSidebar's inline
// backgroundColor="#CC3366").
const BRAND_PINK = "#CC3366";

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
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
});
// 3-char weekday/month ("Thu, Aug 13") -- DayLandscapeView's header corner is a fixed ~120px
// column, too narrow for the long form above.
const etDateLineCompactFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
});
const etYearFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric',
});

/**
 * ET calendar date as "Friday, July 24" ("Thu, Aug 13" when `compact` is set), with the year
 * appended ("Friday, July 24, 2027" / "Thu, Aug 13, 2027") only when it differs from the
 * current ET year. When
 * `isHeader` is true, also appends a brand-pink " · Today" when `date` falls on the current ET
 * calendar day -- reserved for the calendar header, since surfacing "Today" on e.g. a meeting
 * popup's date is redundant.
 */
export const formatMeetingDateLine = (date: Date, isHeader: boolean = false, compact: boolean = false): ReactNode => {
    const now = new Date();
    const base = (compact ? etDateLineCompactFmt : etDateLineFmt).format(date);
    const dateYear = etYearFmt.format(date);
    const currentYear = etYearFmt.format(now);
    const label = dateYear === currentYear ? base : `${base}, ${dateYear}`;

    if (!isHeader) return label;

    const isToday = formatETDateString(date) === formatETDateString(now);
    if (!isToday) return label;

    return (
        <>
            {label}
            <span style={{ color: BRAND_PINK }}> · Today</span>
        </>
    );
};

/**
 * Calendar-only month name for an ET "YYYY-MM-DD" string -- formatted with a UTC-pinned Intl
 * formatter on a UTC-constructed Date, so the label matches the string's own y/m/d without ever
 * being reinterpreted through a real timezone (same Date.UTC-as-calculator pattern as
 * util/timeUtils.ts's getWeekDatesET).
 */
export const monthNameForETDateString = (etDateStr: string): string => {
    const [year, month, day] = etDateStr.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(year, month - 1, day)),
    );
};

/**
 * ET week range as "July 19-25" (same month) or "July 28 - August 3" (crossing months), for the
 * Sunday-Saturday ET week containing the given date. Each boundary's year is appended only when
 * it differs from the current ET year -- same convention as formatMeetingDateLine above, extended
 * to a two-ended range (so a week spanning a year boundary can show a year on one side only, e.g.
 * "December 29 - January 4, 2027").
 */
export const formatMeetingWeekLine = (date: Date): string => {
    const week = getWeekDatesET(formatETDateString(date));
    const [startYear, , startDayStr] = week[0].split('-');
    const [endYear, , endDayStr] = week[6].split('-');
    const currentYear = formatETDateString(new Date()).split('-')[0];

    const startMonth = monthNameForETDateString(week[0]);
    const endMonth = monthNameForETDateString(week[6]);
    const startDay = Number(startDayStr);
    const endDay = Number(endDayStr);
    const startYearSuffix = startYear === currentYear ? '' : `, ${startYear}`;
    const endYearSuffix = endYear === currentYear ? '' : `, ${endYear}`;

    if (startMonth === endMonth && startYear === endYear) {
        return `${startMonth} ${startDay}-${endDay}${endYearSuffix}`;
    }
    return `${startMonth} ${startDay}${startYearSuffix} - ${endMonth} ${endDay}${endYearSuffix}`;
};

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import styles from "./MonthView.module.scss";
import { filterMeetingsForDate, MeetingFilters } from "../../../../util/filters/meetingFilters";
import { getMeetingChipPresentation } from "../../../../util/meetings/meetingChipPresentation";
import { etDateStringToNoonET, isInGridMonth } from "../../../../util/meetings/monthGrid";
import { formatETDateString, formatETWeekdayShort } from "../../../../util/date/timeUtils";
import { formatCompactTime, formatETDateLine, monthNameForETDateString } from "../../../../util/date/timeFormat";
import { dateEnterMotion, type SwipeDirection } from "../../../../util/date/dateTransition";
import { pluralize } from "../../../../util/format/plural";
import { useMonthMeetings } from "../../../../hooks/useMonthMeetings";
import type { WeekMeeting } from "../../../../hooks/useWeekMeetings";
import TopLoadingBar from "../../ui/displays/TopLoadingBar";

// At this many meetings the count switches to the darker emphasis color -- production density
// is 6-9 a day, so 9+ marks an unusually full day.
export const BUSY_DAY_THRESHOLD = 9;

interface MonthViewProps {
    filters: MeetingFilters;
    selectedDate: Date;
    refreshTrigger?: number;
    // Which way the month-transition animation slides (see CalendarProvider's
    // changeSelectedDate) -- same optional-prop reasoning as DayView/WeekView's.
    transitionDirection?: SwipeDirection;
    // Fires with the clicked cell's ET date string ("YYYY-MM-DD"). Deliberately not a
    // selectedDate change: clicking a greyed adjacent-month cell would otherwise jump the
    // whole grid to that month. The day popover (GitHub #461) hangs off this.
    onDayClick?: (etDateStr: string) => void;
}

interface DayDot {
    id: string;
    color: string;
    label: string;
}

// One dot per meeting, start-time order, colored exactly like the meeting's Day/Week chip
// (getMeetingChipPresentation: the room color, grey when only its Zoom room's filter keeps it
// visible, teal for Remote). startTime is the day-clipped time, so an overnight meeting that
// spills in from the night before sorts first on its second day.
const toDots = (meetings: WeekMeeting[], filters: MeetingFilters): DayDot[] =>
    [...meetings]
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title))
        .map((meeting, index) => ({
            id: `${meeting.id}-${index}`,
            color: getMeetingChipPresentation(meeting, filters).primaryColor,
            label: `${formatCompactTime(meeting.displayStartTime ?? meeting.startTime)} ${meeting.title}`,
        }));

const MonthView: React.FC<MonthViewProps> = ({
    filters,
    selectedDate,
    refreshTrigger = 0,
    transitionDirection = "forward",
    onDayClick,
}) => {
    const reducedMotion = useReducedMotion();
    // Rendered from loadedRange (what the meetings belong to), not the requested month, so the
    // cells, dots and enter transition all swap together once the new month's data lands --
    // same loaded-data keying DayView/WeekView use.
    const { loadedRange, meetingsByDate, isLoading } = useMonthMeetings(selectedDate, refreshTrigger);
    const todayKey = formatETDateString(new Date());

    // Filters are applied here, client-side, over the month's already-fetched meetings, so
    // toggling one never refetches.
    const cells = useMemo(
        () =>
            loadedRange.days.map((day) => {
                const date = etDateStringToNoonET(day);
                const meetings = filterMeetingsForDate(meetingsByDate.get(day) ?? [], date, filters);
                return { day, date, dots: toDots(meetings, filters) };
            }),
        [loadedRange, meetingsByDate, filters],
    );

    const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

    return (
        <div className={styles.outerContainer} data-testid="month-view">
            <TopLoadingBar active={isLoading} label="Loading meetings" />
            <div className={styles.scrollContainer}>
                <div className={styles.grid} role="grid" aria-label={`${monthNameForETDateString(`${loadedRange.monthKey}-01`)} ${loadedRange.monthKey.slice(0, 4)}`}>
                    <div className={styles.weekdayHeader} role="row">
                        {cells.slice(0, 7).map(({ day, date }) => (
                            <div key={day} className={styles.weekday} role="columnheader">
                                {formatETWeekdayShort(date)}
                            </div>
                        ))}
                    </div>
                    {/* Keyed by the loaded month, so picking a different day inside the same
                        month never replays the transition -- only a month change does. Vertical
                        (y, 12), matching desktop Day view's exactly. */}
                    <motion.div
                        key={loadedRange.monthKey}
                        className={styles.weeks}
                        role="rowgroup"
                        {...dateEnterMotion(transitionDirection, "y", 12, { reducedMotion })}
                    >
                        {weeks.map((week) => (
                            <div key={week[0].day} className={styles.weekRow} role="row">
                                {week.map(({ day, date, dots }) => {
                                    const isToday = day === todayKey;
                                    const isAdjacentMonth = !isInGridMonth(day, loadedRange);
                                    const count = dots.length;
                                    return (
                                        <div
                                            key={day}
                                            className={styles.cell}
                                            role="gridcell"
                                            data-date={day}
                                        >
                                            <button
                                                type="button"
                                                className={styles.cellButton}
                                                aria-label={`${formatETDateLine(date)}, ${count === 0 ? "no meetings" : pluralize(count, "meeting")}`}
                                                onClick={() => onDayClick?.(day)}
                                            >
                                                <span className={styles.cellHeader}>
                                                    <span
                                                        className={[
                                                            styles.dateNumber,
                                                            isToday ? styles.today : "",
                                                            isAdjacentMonth && !isToday ? styles.adjacentMonth : "",
                                                        ].filter(Boolean).join(" ")}
                                                        aria-current={isToday ? "date" : undefined}
                                                        data-testid="date-number"
                                                    >
                                                        {Number(day.slice(-2))}
                                                    </span>
                                                    {count > 0 && (
                                                        <span
                                                            className={count >= BUSY_DAY_THRESHOLD
                                                                ? `${styles.count} ${styles.countBusy}`
                                                                : styles.count}
                                                            data-testid="meeting-count"
                                                        >
                                                            {count}
                                                        </span>
                                                    )}
                                                </span>
                                                {count > 0 && (
                                                    <span className={styles.dots}>
                                                        {dots.map((dot) => (
                                                            <span
                                                                key={dot.id}
                                                                className={styles.dot}
                                                                // A data-driven room color, not a design constant --
                                                                // the same value Day/Week chips get inline.
                                                                style={{ backgroundColor: dot.color }}
                                                                title={dot.label}
                                                                data-testid="meeting-dot"
                                                            />
                                                        ))}
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default MonthView;

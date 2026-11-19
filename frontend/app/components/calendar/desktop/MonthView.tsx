import React, { useCallback, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import styles from "./MonthView.module.scss";
import MonthDayPopover, { MonthDayPopoverMeeting } from "./MonthDayPopover";
import { filterMeetingsForDate, MeetingFilters } from "../../../../util/filters/meetingFilters";
import { getMeetingChipPresentation } from "../../../../util/meetings/meetingChipPresentation";
import { etDateStringToNoonET, isInGridMonth } from "../../../../util/meetings/monthGrid";
import { ROOM_COLORS } from "../../../../util/rooms/filterColors";
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

// Weekday columns (0 = Sunday) whose popover hangs from the cell's right edge instead of its
// left, so a 272px panel never runs off the grid's right side.
const RIGHT_ALIGNED_COLUMNS = new Set([5, 6]);

interface MonthViewProps {
    filters: MeetingFilters;
    selectedDate: Date;
    refreshTrigger?: number;
    // Which way the month-transition animation slides (see CalendarProvider's
    // changeSelectedDate) -- same optional-prop reasoning as DayView/WeekView's.
    transitionDirection?: SwipeDirection;
    // Admin-only (see hooks/useConflictMids) -- mids with an unresolved conflict. The page
    // passes an empty set for public viewers, so no conflict UI renders for them.
    conflictMids?: Set<string>;
    // The popover's "Open day view →": switch to Day view on this date (noon ET).
    onOpenDay?: (date: Date) => void;
}

type DayMeeting = MonthDayPopoverMeeting & { dotLabel: string };

// One entry per meeting, start-time order, colored exactly like the meeting's Day/Week chip
// (getMeetingChipPresentation: the room color, grey when only its Zoom room's filter keeps it
// visible, teal for Remote). startTime is the day-clipped time, so an overnight meeting that
// spills in from the night before sorts first on its second day.
const toDayMeetings = (meetings: WeekMeeting[], filters: MeetingFilters): DayMeeting[] =>
    [...meetings]
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title))
        .map((meeting, index) => {
            const presentation = getMeetingChipPresentation(meeting, filters);
            const startTime = meeting.displayStartTime ?? meeting.startTime;
            return {
                key: `${meeting.id}-${index}`,
                id: meeting.id,
                title: meeting.title,
                color: presentation.primaryColor,
                startTime,
                endTime: meeting.displayEndTime ?? meeting.endTime,
                location: presentation.room || meeting.zoomRoom || (meeting.tags.includes("Remote") ? "Remote" : ""),
                // Only a real physical room (one with a room color) -- never a Zoom room.
                physicalRoom: meeting.room in ROOM_COLORS ? meeting.room : null,
                dotLabel: `${formatCompactTime(startTime)} ${meeting.title}`,
            };
        });

const MonthView: React.FC<MonthViewProps> = ({
    filters,
    selectedDate,
    refreshTrigger = 0,
    transitionDirection = "forward",
    conflictMids,
    onOpenDay,
}) => {
    const reducedMotion = useReducedMotion();
    const gridRef = useRef<HTMLDivElement>(null);
    // Rendered from loadedRange (what the meetings belong to), not the requested month, so the
    // cells, dots and enter transition all swap together once the new month's data lands --
    // same loaded-data keying DayView/WeekView use.
    const { loadedRange, meetingsByDate, isLoading } = useMonthMeetings(selectedDate, refreshTrigger);
    const todayKey = formatETDateString(new Date());

    // The one open popover's ET date, if any. Closed whenever the displayed month changes --
    // derived during render ("adjusting state when a prop changes"), no effect needed.
    const [openDay, setOpenDay] = useState<string | null>(null);
    const [openDayMonth, setOpenDayMonth] = useState(loadedRange.monthKey);
    if (openDayMonth !== loadedRange.monthKey) {
        setOpenDayMonth(loadedRange.monthKey);
        setOpenDay(null);
    }

    // ✕ and Escape hand focus back to the cell that opened the popover; an outside click
    // leaves it wherever the user clicked.
    const closePopover = useCallback((restoreFocus: boolean) => {
        if (restoreFocus && openDay) {
            gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${openDay}"] > button`)?.focus();
        }
        setOpenDay(null);
    }, [openDay]);

    // Filters are applied here, client-side, over the month's already-fetched meetings, so
    // toggling one never refetches.
    const cells = useMemo(
        () =>
            loadedRange.days.map((day) => {
                const date = etDateStringToNoonET(day);
                const meetings = filterMeetingsForDate(meetingsByDate.get(day) ?? [], date, filters);
                return { day, date, meetings: toDayMeetings(meetings, filters) };
            }),
        [loadedRange, meetingsByDate, filters],
    );

    const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

    return (
        <div className={styles.outerContainer} data-testid="month-view">
            <TopLoadingBar active={isLoading} label="Loading meetings" />
            <div className={styles.scrollContainer}>
                <div
                    ref={gridRef}
                    className={styles.grid}
                    role="grid"
                    aria-label={`${monthNameForETDateString(`${loadedRange.monthKey}-01`)} ${loadedRange.monthKey.slice(0, 4)}`}
                >
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
                                {week.map(({ day, date, meetings }, column) => {
                                    const isToday = day === todayKey;
                                    const isAdjacentMonth = !isInGridMonth(day, loadedRange);
                                    const count = meetings.length;
                                    const doubleBookedCount = conflictMids
                                        ? meetings.filter(m => conflictMids.has(m.id)).length
                                        : 0;
                                    const isOpen = openDay === day;
                                    return (
                                        <div
                                            key={day}
                                            className={isOpen ? `${styles.cell} ${styles.cellOpen}` : styles.cell}
                                            role="gridcell"
                                            data-date={day}
                                        >
                                            <button
                                                type="button"
                                                className={styles.cellButton}
                                                aria-label={`${formatETDateLine(date)}, ${count === 0 ? "no meetings" : pluralize(count, "meeting")}${doubleBookedCount > 0 ? `, ${pluralize(doubleBookedCount, "double-booking")}` : ""}`}
                                                aria-haspopup="dialog"
                                                aria-expanded={isOpen}
                                                onClick={() => setOpenDay(current => (current === day ? null : day))}
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
                                                        {meetings.map((meeting) => (
                                                            <span
                                                                key={meeting.key}
                                                                className={styles.dot}
                                                                // A data-driven room color, not a design constant --
                                                                // the same value Day/Week chips get inline.
                                                                style={{ backgroundColor: meeting.color }}
                                                                title={meeting.dotLabel}
                                                                data-testid="meeting-dot"
                                                            />
                                                        ))}
                                                    </span>
                                                )}
                                                {doubleBookedCount > 0 && (
                                                    <span className={styles.conflictWarning} data-testid="cell-conflict">
                                                        ⚠ {pluralize(doubleBookedCount, "double-booking")}
                                                    </span>
                                                )}
                                            </button>
                                            {isOpen && (
                                                <MonthDayPopover
                                                    date={date}
                                                    meetings={meetings}
                                                    conflictMids={conflictMids}
                                                    align={RIGHT_ALIGNED_COLUMNS.has(column) ? "right" : "left"}
                                                    onClose={closePopover}
                                                    onOpenDay={() => {
                                                        setOpenDay(null);
                                                        onOpenDay?.(date);
                                                    }}
                                                />
                                            )}
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

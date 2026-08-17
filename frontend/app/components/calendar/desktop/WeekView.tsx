import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import styles from './WeekView.module.scss';
import DayColumn from "../shared/DayColumn";
import { filterMeetingsForDate, MeetingFilters } from "../../../../util/filters/meetingFilters";
import { getMeetingChipPresentation } from "../../../../util/meetings/meetingChipPresentation";
import { ZOOM_ROOM_COLOR } from "../../../../util/rooms/filterColors";
import {
    formatETDateString,
    formatETWeekdayShort,
    getCurrentETMinutesSinceMidnight,
    getETDayOfMonth,
} from "../../../../util/date/timeUtils";
import { layoutOverlappingMeetings } from "../../../../util/meetings/meetingOverlapLayout";
import { getFirstDayOfWeek, getDaysOfWeek, addDaysToDate } from "../../../../util/date/weekDates";
import { useWeekMeetings, WeekMeeting, prefetchWeek } from "../../../../hooks/useWeekMeetings";
import TopLoadingBar from "../../ui/displays/TopLoadingBar";
import { dateEnterMotion, type SwipeDirection } from "../../../../util/date/dateTransition";

export { invalidateWeekCache } from "../../../../hooks/useWeekMeetings";

type Meeting = WeekMeeting;

// Format date to display in column header - just return the day number
const formatDateNumber = (date: Date): string => {
    return getETDayOfMonth(date).toString();
};

// Format day name - just 3 letter abbreviation
const formatDayName = (date: Date): string => {
    return formatETWeekdayShort(date).toUpperCase();
};


interface WeekViewProps {
    filters: MeetingFilters;
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
    selectedMeetingID: string | null;
    setSelectedMeetingID: (meetingId: string) => void;
    // The date of the specific occurrence currently selected (not just its mid) -- lets each
    // DayColumn scope its own "is this box selected" check to the exact day clicked, so a
    // recurring meeting doesn't highlight every occurrence across the whole week at once.
    selectedOccurrenceDate?: Date | null;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
    setAnchorEl: (el: HTMLElement) => void;
    setLastClickedDate?: (date: Date) => void;
    refreshTrigger?: number;
    // Disables scrolling this view while the ViewMeeting popup is open -- it's anchored to
    // the clicked box's on-screen position, so scrolling underneath it while open just
    // fights the popup's own reposition-on-scroll logic instead of being useful.
    scrollLocked?: boolean;
    // Admin-only (see hooks/useConflictMids) -- mids with an unresolved conflict. Omitted
    // entirely by /signage's public kiosk render, which defaults to no badges ever showing.
    conflictMids?: Set<string>;
    // Admin-only (see hooks/useSyncErrorMids) -- mids with a Google Calendar/Zoom sync error.
    syncErrorMids?: Set<string>;
    // Which way the week-transition animation below slides (see CalendarProvider's
    // changeSelectedDate) -- optional (not read from useCalendarContext directly) because
    // /signage renders this component with no CalendarProvider ancestor at all; defaults to
    // "forward" there, so the transition still plays, just always in one direction.
    transitionDirection?: SwipeDirection;
}

const WeekView: React.FC<WeekViewProps> = ({
    filters,
    selectedDate,
    setSelectedDate,
    selectedMeetingID,
    setSelectedMeetingID,
    selectedOccurrenceDate,
    setSelectedNewMeeting,
    setAnchorEl,
    setLastClickedDate,
    refreshTrigger = 0,
    scrollLocked = false,
    conflictMids,
    syncErrorMids,
    transitionDirection = "forward",
}) => {
    const reducedMotion = useReducedMotion();
    const [currentTimePosition, setCurrentTimePosition] = useState(0);
    const [weekStartDate, setWeekStartDate] = useState<Date>(() => getFirstDayOfWeek(selectedDate));
    const viewContainerRef = useRef<HTMLDivElement>(null);
    const { meetings: allMeetings, isLoading, loadedWeekStartDate } = useWeekMeetings(weekStartDate, refreshTrigger);
    // The days actually rendered -- derived from loadedWeekStartDate (what allMeetings belongs
    // to), not weekStartDate (what's being requested), so the enter transition and the day
    // columns/meetings it wraps update atomically once real data has landed. See
    // useWeekMeetings' own comment on loadedWeekStartDate for why this distinction matters.
    const renderedDaysOfWeek = getDaysOfWeek(loadedWeekStartDate);

    // Format time slots for hour markers
    const formatTime = (hour: number): string => {
        const period = hour >= 12 ? "PM" : "AM";
        const formattedHour = hour % 12 || 12;
        return `${formattedHour} ${period}`;
    };

    const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

    // Update current time indicator position
    const updateTimePosition = useCallback(() => {
        const basePosition = getCurrentETMinutesSinceMidnight() * (120 / 60);
        const offset = 40; // height of .dayHeader
        setCurrentTimePosition(basePosition + offset);
    }, []);

    // Scroll the grid so the current time starts ~2 hours into the visible area
    const scrollToCurrentTime = useCallback(() => {
        if (viewContainerRef.current) {
            const dayHeaderOffset = 40; // height of .dayHeader, see updateTimePosition
            const scrollOffset = dayHeaderOffset + getCurrentETMinutesSinceMidnight() * (120 / 60) - 240;
            viewContainerRef.current.scrollTop = Math.max(0, scrollOffset);
        }
    }, []);

    // Only replace weekStartDate's identity when the ET week actually changes — otherwise
    // picking a different day in the same week would re-trigger the fetch+scroll effect below.
    // Derived during render (not an effect): purely a function of selectedDate, so this is
    // the "adjusting state when a prop changes" case, no external system involved.
    const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);
    if (selectedDate !== prevSelectedDate) {
        setPrevSelectedDate(selectedDate);
        const newWeekStartDate = getFirstDayOfWeek(selectedDate);
        if (formatETDateString(weekStartDate) !== formatETDateString(newWeekStartDate)) {
            setWeekStartDate(newWeekStartDate);
        }
    }

    // Gates .viewContainer's visibility until the very first scroll-to-current-time
    // completes -- without this there's a beat of the wrong scroll position (12 AM) visible
    // before JS jumps it to "now". One-way: only ever flips true once, on this view's first
    // mount -- later week changes must NOT reset scroll position, or navigating to the
    // next/prev week fights the user back to "now" every time (matching DayPortraitView's own
    // initialScrollDone-guarded scrollToCurrentTime call, and DayView's identical fix).
    const [initialScrollDone, setInitialScrollDone] = useState(false);

    // Resets the current-time indicator whenever the visible week changes (scroll position
    // itself is one-way, guarded below). Meeting fetching itself is owned by useWeekMeetings
    // above -- kept as a separate effect since it's an independent concern (indicator/scroll vs.
    // data), not because the trigger differs. useLayoutEffect (not useEffect) so the scroll
    // jump happens before paint.
    useLayoutEffect(() => {
        // Sets the current-time indicator immediately rather than leaving it blank for up
        // to 60s until the interval below first fires.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        updateTimePosition();
        if (initialScrollDone === false) {
            const container = viewContainerRef.current;
            if (container && container.scrollHeight > container.clientHeight) {
                scrollToCurrentTime();
                setInitialScrollDone(true);
            } else if (container) {
                // The container may not be scrollable yet: on /signage its bounded height
                // arrives asynchronously from the page's recalcScale, after this mount-time
                // effect -- scrolling now would silently no-op and the latch would mask it.
                // Watch for the resize that makes it scrollable, scroll once, then latch
                // (same retry idea as DayLandscapeView's width-measurement guard).
                const observer = new ResizeObserver(() => {
                    if (container.scrollHeight > container.clientHeight) {
                        scrollToCurrentTime();
                        setInitialScrollDone(true);
                        observer.disconnect();
                    }
                });
                observer.observe(container);
                // The latch also gates the visibility flash-guard -- if the grid genuinely
                // fits its container (nothing to ever scroll), the observer condition never
                // holds, so latch anyway after a beat rather than staying hidden forever.
                // Flips only the latch (visibility guard) -- the observer stays connected so a
                // bounded height arriving later than the fallback still gets its one scroll;
                // the observer disconnects itself on success and cleanup covers the rest.
                const fallbackId = window.setTimeout(() => {
                    setInitialScrollDone(true);
                }, 2000);
                const intervalId = setInterval(updateTimePosition, 60000);
                return () => {
                    observer.disconnect();
                    window.clearTimeout(fallbackId);
                    clearInterval(intervalId);
                };
            } else {
                // Null ref can't scroll anyway -- latch so the visibility guard never wedges
                // the grid invisible.
                setInitialScrollDone(true);
            }
        }

        const intervalId = setInterval(updateTimePosition, 60000);
        return () => clearInterval(intervalId);
        // initialScrollDone is deliberately omitted: it's a write-once latch, so re-running
        // this effect when it flips would just reset the interval above for no reason.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStartDate, updateTimePosition, scrollToCurrentTime]);

    // Warms weekMeetingCache for the neighboring weeks (see prefetchWeek's own comment) so an
    // arrow click's fetch is (almost always) a cache hit by the time the new week's motion.div
    // mounts. A separate, plain useEffect (not the layout effect above, and not folded into
    // useWeekMeetings' own fetch) for two reasons: (1) useWeekMeetings' visible-week fetch runs
    // in its own passive useEffect -- keeping the prefetch calls out of a *layout* effect means
    // React flushes that fetch first (layout effects always run before passive ones), so the
    // week the user is actually looking at is never queued behind its off-screen neighbors; (2)
    // it needs refreshTrigger in its deps, since useWeekMeetings' own force-fetch on a
    // refreshTrigger bump clears weekMeetingCache wholesale (including the prefetched
    // neighbors) -- without re-running this, the next arrow click within the 30s auto-refresh
    // window would slide in stale content again.
    useEffect(() => {
        prefetchWeek(addDaysToDate(weekStartDate, -7));
        prefetchWeek(addDaysToDate(weekStartDate, 7));
    }, [weekStartDate, refreshTrigger]);

    // Get meetings for a specific day, filtered by room if applicable
    const getMeetingsForDay = (date: Date) => {
        return layoutOverlappingMeetings(filterMeetingsForDate(allMeetings, date, filters));
    };

    // Chip color + displayed room, filter-aware -- a Hybrid meeting surviving only via its
    // Zoom room presents as that Zoom room (grey, Zoom room name), matching Day view.
    const presentMeeting = <T extends Meeting>(meeting: T) => ({
        ...meeting,
        ...getMeetingChipPresentation(meeting, filters),
    });

    // Check if a date is the current date
    const isCurrentDate = (date: Date): boolean =>
        formatETDateString(date) === formatETDateString(new Date());

    return (
        <div className={styles.outerContainer}>
            <TopLoadingBar active={isLoading} label="Loading meetings" />
            <div
                className={styles.viewContainer}
                ref={viewContainerRef}
                data-testid="week-view-scroll-container"
                style={{
                    ...(scrollLocked ? { overflow: 'hidden' } : undefined),
                    visibility: initialScrollDone ? 'visible' : 'hidden',
                }}
            >
                {/* Time column */}
                <div className={styles.timeColumn}>
                    <div className={styles.timeHeader}>
                        {/* Empty cell for alignment */}
                    </div>
                    <div className={styles.timeSlots}>
                        {timeSlots.map((time, index) => (
                            <div key={index} className={styles.timeSlot}>
                                {time}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Day columns -- keyed by loadedWeekStartDate (what allMeetings actually
                    belongs to), not weekStartDate (what's being requested) or selectedDate, so
                    (1) picking a different day within the same visible week doesn't re-trigger
                    the transition, only navigating to a different week does, and (2) the
                    transition doesn't start until real data for the new week has landed --
                    otherwise it can animate in empty or prior-week content for however long the
                    fetch takes. Horizontal (x), not vertical -- a week of days reads
                    left-to-right the same way DayPortraitView's own day-to-day swipe does,
                    unlike DayView's per-room-row vertical one. */}
                <motion.div
                    key={formatETDateString(loadedWeekStartDate)}
                    className={styles.daysContainer}
                    {...dateEnterMotion(transitionDirection, "x", 24, { reducedMotion })}
                >
                    {renderedDaysOfWeek.map((day, index) => {
                        const dayMeetings = getMeetingsForDay(day);
                        const isToday = isCurrentDate(day);

                        // Create a custom header that only contains the day info directly
                        const customHeader = (
                            <div className={styles.dayHeader}>
                                <span className={styles.dayName}>{formatDayName(day)}</span>
                                {" "}
                                <span className={isToday ? styles.currentDate : styles.dateNumber}>
                                    {formatDateNumber(day)}
                                </span>
                            </div>
                        );

                        return (
                            <div
                                key={index}
                                className={styles.dayColumn}
                                onClick={() => {
                                    // When clicking on a day column, update the selected date
                                    setSelectedDate(day);
                                }}
                            >
                                {customHeader}

                                <DayColumn
                                    roomColor={ZOOM_ROOM_COLOR} // Unused fallback: every meeting sets primaryColor via presentMeeting
                                    meetings={dayMeetings.map(meeting => ({
                                        ...presentMeeting(meeting),
                                        overflowMeetings: meeting.overflowMeetings?.map(presentMeeting),
                                    }))}
                                    selectedMeetingID={selectedMeetingID}
                                    setSelectedMeetingID={setSelectedMeetingID}
                                    selectedOccurrenceDate={selectedOccurrenceDate}
                                    setSelectedNewMeeting={setSelectedNewMeeting}
                                    setAnchorEl={setAnchorEl}
                                    columnDate={day}
                                    setLastClickedDate={setLastClickedDate}
                                    conflictMids={conflictMids}
                                    syncErrorMids={syncErrorMids}
                                />

                                {/* Current time indicator - only show for current day */}
                                {isToday && (
                                    <div
                                        className={styles.currentTimeIndicator}
                                        style={{ top: `${currentTimePosition}px` }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </motion.div>
            </div>
        </div>
    );
};

export default WeekView;
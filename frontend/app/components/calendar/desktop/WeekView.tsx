import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import styles from '../../../../styles/components/calendar/desktop/WeekView.module.scss';
import DayColumn from "../shared/DayColumn";
import { filterMeetingsForDate, MeetingFilters } from "../../../../util/filters/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../../../util/rooms/filterColors";
import { formatETDateString } from "../../../../util/date/timeUtils";
import { layoutOverlappingMeetings } from "../../../../util/meetings/meetingOverlapLayout";
import { getFirstDayOfWeek, getDaysOfWeek } from "../../../../util/date/weekDates";
import { useWeekMeetings, WeekMeeting } from "../../../../hooks/useWeekMeetings";
import TopLoadingBar from "../../atoms/TopLoadingBar";

export { invalidateWeekCache } from "../../../../hooks/useWeekMeetings";

type Meeting = WeekMeeting;

// Format date to display in column header - just return the day number
const formatDateNumber = (date: Date): string => {
    return date.getDate().toString();
};

// Format day name - just 3 letter abbreviation
const formatDayName = (date: Date): string => {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
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
}) => {
    const [currentTimePosition, setCurrentTimePosition] = useState(0);
    const [weekStartDate, setWeekStartDate] = useState<Date>(() => getFirstDayOfWeek(selectedDate));
    const [daysOfWeek, setDaysOfWeek] = useState<Date[]>(() => getDaysOfWeek(weekStartDate));
    const viewContainerRef = useRef<HTMLDivElement>(null);
    const { meetings: allMeetings, isLoading } = useWeekMeetings(weekStartDate, refreshTrigger);

    // Format time slots for hour markers
    const formatTime = (hour: number): string => {
        const period = hour >= 12 ? "PM" : "AM";
        const formattedHour = hour % 12 || 12;
        return `${formattedHour} ${period}`;
    };

    const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

    // Update current time indicator position
    const updateTimePosition = useCallback(() => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const basePosition = currentHour * 120 + currentMinutes * (120 / 60);
        const offset = 40; // height of .dayHeader
        setCurrentTimePosition(basePosition + offset);
    }, []);

    // Scroll the grid so the current time starts ~2 hours into the visible area
    const scrollToCurrentTime = useCallback(() => {
        if (viewContainerRef.current) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinutes = now.getMinutes();
            const dayHeaderOffset = 40; // height of .dayHeader, see updateTimePosition
            const scrollOffset = dayHeaderOffset + (currentHour * 120 + currentMinutes * (120 / 60)) - 240;
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
            setDaysOfWeek(getDaysOfWeek(newWeekStartDate));
        }
    }

    // Gates .viewContainer's visibility until the very first scroll-to-current-time
    // completes -- without this there's a beat of the wrong scroll position (12 AM) visible
    // before JS jumps it to "now". One-way: only ever flips true once, on this view's first
    // mount -- later week changes reset scroll position same as always but don't re-hide
    // already-visible content.
    const [initialScrollDone, setInitialScrollDone] = useState(false);

    // Resets the current-time indicator/scroll position whenever the visible week changes.
    // Meeting fetching itself is owned by useWeekMeetings above -- kept as a separate effect
    // since it's an independent concern (indicator/scroll vs. data), not because the trigger
    // differs. useLayoutEffect (not useEffect) so the scroll jump happens before paint.
    useLayoutEffect(() => {
        // Sets the current-time indicator immediately rather than leaving it blank for up
        // to 60s until the interval below first fires.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        updateTimePosition();
        scrollToCurrentTime();
        setInitialScrollDone(true);

        const intervalId = setInterval(updateTimePosition, 60000);
        return () => clearInterval(intervalId);
    }, [weekStartDate, updateTimePosition, scrollToCurrentTime]);

    // Get meetings for a specific day, filtered by room if applicable
    const getMeetingsForDay = (date: Date) => {
        return layoutOverlappingMeetings(filterMeetingsForDate(allMeetings, date, filters));
    };

    // Get room color for a meeting (physical rooms have distinct colors; Zoom rooms are all
    // gray; Remote -- no physical or Zoom room at all -- gets its own distinct color).
    const getRoomColor = (meeting: Meeting) => {
        if (meeting.tags.includes('Remote')) return REMOTE_COLOR;
        return ROOM_COLORS[meeting.room] ?? ZOOM_ROOM_COLOR;
    };

    // Check if a date is the current date
    const isCurrentDate = (date: Date): boolean =>
        formatETDateString(date) === formatETDateString(new Date());

    return (
        <div className={styles.outerContainer}>
            <TopLoadingBar active={isLoading} />
            <div
                className={styles.viewContainer}
                ref={viewContainerRef}
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

                {/* Day columns */}
                <div className={styles.daysContainer}>
                    {daysOfWeek.map((day, index) => {
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
                                    roomColor={ZOOM_ROOM_COLOR} // Unused fallback: every meeting sets primaryColor via getRoomColor
                                    meetings={dayMeetings.map(meeting => ({
                                        ...meeting,
                                        primaryColor: getRoomColor(meeting),
                                        overflowMeetings: meeting.overflowMeetings?.map(m => ({
                                            ...m,
                                            primaryColor: getRoomColor(m)
                                        })),
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
                </div>
            </div>
        </div>
    );
};

export default WeekView;
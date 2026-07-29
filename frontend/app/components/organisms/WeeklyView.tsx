import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from '../../../styles/components/organisms/WeeklyView.module.scss';
import WeeklyViewColumn from "../molecules/WeeklyViewColumn";
import { passesTagFilters, passesRoomFilter, MeetingFilters } from "../../../util/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../../util/filterColors";
import { formatETDateString, convertETToUTC } from "../../../util/timeUtils";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../util/meetingOverlapLayout";
import { createCache } from "../../../util/simpleCache";
import { IMeeting } from "../../../util/models";

type Meeting = OverlapMeeting;

const weekMeetingCache = createCache<Meeting[]>();

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what WeeklyViewColumn expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
});

const fetchMeetingsByWeek = async (startDate: Date, endDate: Date): Promise<Meeting[]> => {
    const formattedStart = formatETDateString(startDate);
    const formattedEnd = formatETDateString(endDate);
    const cacheKey = `${formattedStart}-${formattedEnd}`;

    return weekMeetingCache.getOrFetch(cacheKey, async () => {
        console.log("[WeeklyView] Fetching meetings for week:", cacheKey);

        try {
            const response = await fetch(`/api/retrieve/meeting/week?startDate=${formattedStart}&endDate=${formattedEnd}`);
            const data = await response.json();
            console.log("[WeeklyView] Raw API response for", cacheKey, ":", data);

            // startTime/endTime clip to this day (for layout); displayStartTime/displayEndTime
            // keep the true times, so an overnight meeting's cards both label as "11PM-1AM".
            const meetings: Meeting[] = data.map((meeting: IMeeting & { date: string }) => {
                const trueStart = new Date(meeting.startDateTime);
                const trueEnd = new Date(meeting.endDateTime);
                const startsToday = formatETDateString(trueStart) === meeting.date;
                const endsToday = formatETDateString(trueEnd) === meeting.date;

                return {
                    id: meeting.mid,
                    title: meeting.title,
                    startTime: startsToday ? etTimeFmt.format(trueStart) : "00:00",
                    endTime: endsToday ? etTimeFmt.format(trueEnd) : "24:00",
                    displayStartTime: etTimeFmt.format(trueStart),
                    displayEndTime: etTimeFmt.format(trueEnd),
                    date: meeting.date,
                    tags: [...meeting.calType, meeting.modeType],
                    room: meeting.room,
                    zoomRoom: meeting.zoomRoom,
                };
            });

            return meetings;
        } catch (error) {
            // error objects don't serialize over CDP -- log the message directly so it's
            // actually visible in the piped-through e2e console output.
            console.error("[WeeklyView] Error fetching meetings for", cacheKey, ":", error instanceof Error ? error.message : String(error));
            return [];
        }
    });
};

// Function to invalidate the cache for a specific week
export const invalidateWeekCache = (startDate: Date, endDate: Date) => {
    const formattedStart = formatETDateString(startDate);
    const formattedEnd = formatETDateString(endDate);
    weekMeetingCache.invalidate(`${formattedStart}-${formattedEnd}`);
};

// Get the first day (Sunday) of the ET week containing the provided date. Computed from ET
// calendar-date integers, not Date.prototype.getDay()/getDate() -- those interpret in the
// runtime's local timezone, which is correct on a machine set to America/New_York but silently
// picks the wrong week in CI, where the runtime defaults to UTC: near ET's midnight boundary,
// a UTC-local getDay() disagrees with the real ET calendar day by one. Returned as noon ET
// (not midnight) so re-deriving an ET date string from it later can't roll back a day.
const getFirstDayOfWeek = (date: Date): Date => {
    const etDateStr = formatETDateString(date);
    const [year, month, day] = etDateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const sundayEtDateStr = new Date(Date.UTC(year, month - 1, day - dow)).toISOString().slice(0, 10);
    return new Date(convertETToUTC(`${sundayEtDateStr}T12:00:00`));
};

// Generate an array of dates for the entire week, same ET-safe construction as above.
const getDaysOfWeek = (startDate: Date): Date[] => {
    const etDateStr = formatETDateString(startDate);
    const [year, month, day] = etDateStr.split('-').map(Number);
    return Array.from({ length: 7 }, (_, i) => {
        const dayEtDateStr = new Date(Date.UTC(year, month - 1, day + i)).toISOString().slice(0, 10);
        return new Date(convertETToUTC(`${dayEtDateStr}T12:00:00`));
    });
};

// Format date to display in column header - just return the day number
const formatDateNumber = (date: Date): string => {
    return date.getDate().toString();
};

// Format day name - just 3 letter abbreviation
const formatDayName = (date: Date): string => {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
};


interface WeeklyViewProps {
    filters: MeetingFilters;
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
    selectedMeetingID: string | null;
    setSelectedMeetingID: (meetingId: string) => void;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
    setAnchorEl: (el: HTMLElement) => void;
    refreshTrigger?: number;
    // Disables scrolling this view while the ViewMeeting popup is open -- it's anchored to
    // the clicked box's on-screen position, so scrolling underneath it while open just
    // fights the popup's own reposition-on-scroll logic instead of being useful.
    scrollLocked?: boolean;
}

const WeeklyView: React.FC<WeeklyViewProps> = ({
    filters,
    selectedDate,
    setSelectedDate,
    selectedMeetingID,
    setSelectedMeetingID,
    setSelectedNewMeeting,
    setAnchorEl,
    refreshTrigger = 0,
    scrollLocked = false,
}) => {
    const [currentTimePosition, setCurrentTimePosition] = useState(0);
    const [weekStartDate, setWeekStartDate] = useState<Date>(() => getFirstDayOfWeek(selectedDate));
    const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
    const [daysOfWeek, setDaysOfWeek] = useState<Date[]>(() => getDaysOfWeek(weekStartDate));
    const viewContainerRef = useRef<HTMLDivElement>(null);
    // Guards against out-of-order responses: rapid date/filter changes can fire overlapping
    // fetches, and without this a slower-but-stale response can overwrite a newer one.
    const fetchRequestIdRef = useRef(0);

    // Ref instead of a `weekStartDate` closure/dependency so fetchWeekMeetings's identity
    // stays stable across week changes — needed so the refreshTrigger effect below doesn't
    // fire an extra forced fetch every time the week changes (see that effect's comment).
    const weekStartDateRef = useRef(weekStartDate);
    useEffect(() => {
        weekStartDateRef.current = weekStartDate;
    }, [weekStartDate]);

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

    // Function to fetch week meetings with optional cache invalidation
    const fetchWeekMeetings = useCallback(async (forceFetch = false) => {
        const startDate = weekStartDateRef.current;
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        // Clear the entire cache so stale data on other weeks is also dropped.
        if (forceFetch) {
            weekMeetingCache.clear();
        }

        const requestId = ++fetchRequestIdRef.current;
        const meetings = await fetchMeetingsByWeek(startDate, endDate);
        if (requestId === fetchRequestIdRef.current) {
            setAllMeetings(meetings);
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

    // Fetch meetings for the entire week
    useEffect(() => {
        fetchWeekMeetings();
        // Sets the current-time indicator immediately rather than leaving it blank for up
        // to 60s until the interval below first fires.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        updateTimePosition();
        scrollToCurrentTime();

        const intervalId = setInterval(updateTimePosition, 60000);
        return () => clearInterval(intervalId);
    }, [weekStartDate, fetchWeekMeetings, updateTimePosition, scrollToCurrentTime]);

    // Watch for refresh trigger changes
    useEffect(() => {
        if (refreshTrigger > 0) {
            console.log("Refreshing weekly view due to trigger change:", refreshTrigger);
            fetchWeekMeetings(true); // Force fetch (invalidate cache)
        }
    }, [refreshTrigger, fetchWeekMeetings]);

    // Get meetings for a specific day, filtered by room if applicable
    const getMeetingsForDay = (date: Date) => {
        const formattedDate = formatETDateString(date);

        // Filter meetings by date, room/zoom-room, and calType/mode tags
        const filteredMeetings = allMeetings.filter(meeting => {
            const matchesDate = meeting.date === formattedDate;

            // A Hybrid meeting occupies both its physical room and its Zoom room, so it
            // should stay visible if either resource's filter is enabled. Remote has
            // neither -- it's gated on the virtual "Remote" room key instead (see
            // util/rooms.ts's defaultRooms), or it would never pass either check below.
            const isRemote = meeting.tags.includes('Remote');
            const isRoomIncluded = isRemote
                ? passesRoomFilter('Remote', filters)
                : passesRoomFilter(meeting.room, filters) ||
                    (!!meeting.zoomRoom && passesRoomFilter(meeting.zoomRoom, filters));

            return matchesDate && isRoomIncluded && passesTagFilters(meeting.tags, filters);
        });

        return layoutOverlappingMeetings(filteredMeetings);
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
            <div
                className={styles.viewContainer}
                ref={viewContainerRef}
                style={scrollLocked ? { overflow: 'hidden' } : undefined}
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

                                <WeeklyViewColumn
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
                                    setSelectedNewMeeting={setSelectedNewMeeting}
                                    setAnchorEl={setAnchorEl}
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

export default WeeklyView;
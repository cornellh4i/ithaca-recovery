import React, { useEffect, useRef, useState } from "react";
import styles from '../../../styles/components/organisms/WeeklyView.module.scss';
import WeeklyViewColumn from "../molecules/WeeklyViewColumn";
import { passesTagFilters, passesRoomFilter } from "../../../util/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR } from "../../../util/filterColors";

type Meeting = {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    date: string; // ET calendar date this occurrence belongs to, as returned by the week API
    tags: string[];
    room: string;
    zoomAccount?: string | null;
    positionIndex?: number; // Column index among overlapping meetings, assigned by layoutOverlappingMeetings
    totalOverlapping?: number; // Column count among overlapping meetings, assigned by layoutOverlappingMeetings
    isOverflowIndicator?: boolean; // "+N more" pseudo-entry standing in for meetings past MAX_VISIBLE_OVERLAP
    overflowCount?: number;
};

type Room = {
    name: string;
    primaryColor: string;
    meetings: Meeting[];
};

const meetingCache = new Map<string, Meeting[]>();

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what WeeklyViewColumn expects.
const etTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false,
});

const fetchMeetingsByWeek = async (startDate: Date, endDate: Date): Promise<Meeting[]> => {
    const formattedStart = startDate.toISOString().split('T')[0];
    const formattedEnd = endDate.toISOString().split('T')[0];
    const cacheKey = `${formattedStart}-${formattedEnd}`;

    if (meetingCache.has(cacheKey)) {
        console.log("Using cached data for week:", cacheKey);
        return meetingCache.get(cacheKey) || [];
    }

    console.log("Fetching meetings for week:", cacheKey);

    try {
        const response = await fetch(`/api/retrieve/meeting/week?startDate=${formattedStart}&endDate=${formattedEnd}`);
        const data = await response.json();
        console.log("Raw API response:", data);

        const meetings: Meeting[] = data.map((meeting: any) => ({
            id: meeting.mid,
            title: meeting.title,
            startTime: etTimeFmt.format(new Date(meeting.startDateTime)),
            endTime: etTimeFmt.format(new Date(meeting.endDateTime)),
            date: meeting.date, // ET calendar date, set by the week API's per-day expansion
            tags: [...meeting.calType, meeting.modeType],
            room: meeting.room,
            zoomAccount: meeting.zoomAccount,
        }));

        meetingCache.set(cacheKey, meetings);
        return meetings;
    } catch (error) {
        console.error("Error fetching weekly meetings:", error);
        return [];
    }
};

// Function to invalidate the cache for a specific week
export const invalidateWeekCache = (startDate: Date, endDate: Date) => {
    const formattedStart = startDate.toISOString().split('T')[0];
    const formattedEnd = endDate.toISOString().split('T')[0];
    const cacheKey = `${formattedStart}-${formattedEnd}`;
    console.log(`Invalidating cache for week: ${cacheKey}`);
    meetingCache.delete(cacheKey);
};

// Get the first day (Sunday) of the week containing the provided date. Operates on a
// copy — selectedDate is shared state owned by the parent, and Dates are mutable, so
// mutating the input here would silently corrupt that state without going through
// setSelectedDate (surfacing as a stale/wrong date on the next unrelated re-render).
const getFirstDayOfWeek = (date: Date): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() - result.getDay());
    return result;
};

const toMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// At most this many meetings render as full columns per overlapping cluster; any more
// are folded into a single "+N more" indicator instead of shrinking columns further.
const MAX_VISIBLE_OVERLAP = 2;

/**
 * Lays out a day's meetings so partially-overlapping ones share the column instead of
 * fully covering each other. Two passes:
 * 1. Sweep left to right by start time, splitting meetings into clusters of mutually
 *    (possibly transitively) overlapping meetings.
 * 2. Within each cluster, greedily assign each meeting to the first column whose current
 *    occupant has already ended (classic interval-graph-coloring calendar layout) — the
 *    cluster's column count becomes every meeting's totalOverlapping/width divisor.
 */
const layoutOverlappingMeetings = (meetings: Meeting[]): Meeting[] => {
    // Title as a tiebreaker keeps column/overflow assignment consistent across renders
    // and across days — meetings sharing a start time would otherwise fall back to
    // whatever order the database happened to return them in, which isn't guaranteed
    // stable (each day's meetings come from a separate query in the week route).
    const sorted = [...meetings].sort((a, b) =>
        toMinutes(a.startTime) - toMinutes(b.startTime) || a.title.localeCompare(b.title)
    );

    const clusters: Meeting[][] = [];
    let currentCluster: Meeting[] = [];
    let clusterEnd = -Infinity;

    sorted.forEach(meeting => {
        const start = toMinutes(meeting.startTime);
        if (currentCluster.length > 0 && start >= clusterEnd) {
            clusters.push(currentCluster);
            currentCluster = [];
            clusterEnd = -Infinity;
        }
        currentCluster.push(meeting);
        clusterEnd = Math.max(clusterEnd, toMinutes(meeting.endTime));
    });
    if (currentCluster.length > 0) clusters.push(currentCluster);

    const result: Meeting[] = [];
    clusters.forEach(cluster => {
        const columnEnds: number[] = []; // end time (minutes) currently occupying each column
        const positioned = cluster.map(meeting => {
            const start = toMinutes(meeting.startTime);
            const end = toMinutes(meeting.endTime);
            let column = columnEnds.findIndex(columnEnd => columnEnd <= start);
            if (column === -1) {
                column = columnEnds.length;
                columnEnds.push(end);
            } else {
                columnEnds[column] = end;
            }
            return { ...meeting, positionIndex: column } as Meeting;
        });

        const totalOverlapping = columnEnds.length;

        if (totalOverlapping <= MAX_VISIBLE_OVERLAP) {
            positioned.forEach(meeting => {
                result.push(totalOverlapping > 1 ? { ...meeting, totalOverlapping } : meeting);
            });
            return;
        }

        // Cap at MAX_VISIBLE_OVERLAP full columns; fold the rest into one "+N more"
        // indicator spanning their combined time range.
        const shown = positioned.filter(m => (m.positionIndex ?? 0) < MAX_VISIBLE_OVERLAP);
        const overflow = positioned.filter(m => (m.positionIndex ?? 0) >= MAX_VISIBLE_OVERLAP);

        shown.forEach(meeting => {
            result.push({ ...meeting, totalOverlapping: MAX_VISIBLE_OVERLAP });
        });

        const overflowStart = Math.min(...overflow.map(m => toMinutes(m.startTime)));
        const overflowEnd = Math.max(...overflow.map(m => toMinutes(m.endTime)));
        result.push({
            id: `overflow-${cluster[0].date}-${overflowStart}`,
            title: '',
            startTime: minutesToTime(overflowStart),
            endTime: minutesToTime(overflowEnd),
            date: cluster[0].date,
            tags: [],
            room: '',
            isOverflowIndicator: true,
            overflowCount: overflow.length,
        });
    });

    return result;
};

// Generate an array of dates for the entire week
const getDaysOfWeek = (startDate: Date): Date[] => {
    return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        return date;
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
    filters: any;
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
    setSelectedMeetingID: (meetingId: string) => void;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
    refreshTrigger?: number;
}

const WeeklyView: React.FC<WeeklyViewProps> = ({
    filters,
    selectedDate,
    setSelectedDate,
    setSelectedMeetingID,
    setSelectedNewMeeting,
    refreshTrigger = 0
}) => {
    const [currentTimePosition, setCurrentTimePosition] = useState(0);
    const [weekStartDate, setWeekStartDate] = useState<Date>(getFirstDayOfWeek(selectedDate));
    const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
    const [daysOfWeek, setDaysOfWeek] = useState<Date[]>(getDaysOfWeek(weekStartDate));
    const viewContainerRef = useRef<HTMLDivElement>(null);

    // Format time slots for hour markers
    const formatTime = (hour: number): string => {
        const period = hour >= 12 ? "PM" : "AM";
        const formattedHour = hour % 12 || 12;
        return `${formattedHour} ${period}`;
    };

    const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

    // Function to fetch week meetings with optional cache invalidation
    const fetchWeekMeetings = async (forceFetch = false) => {
        const endDate = new Date(weekStartDate);
        endDate.setDate(weekStartDate.getDate() + 6);

        // Clear the entire cache so stale data on other weeks is also dropped.
        if (forceFetch) {
            meetingCache.clear();
        }

        const meetings = await fetchMeetingsByWeek(weekStartDate, endDate);
        setAllMeetings(meetings);
    };

    // Update the week when selected date changes
    useEffect(() => {
        const newWeekStartDate = getFirstDayOfWeek(selectedDate);
        setWeekStartDate(newWeekStartDate);
        setDaysOfWeek(getDaysOfWeek(newWeekStartDate));
    }, [selectedDate]);

    // Fetch meetings for the entire week
    useEffect(() => {
        fetchWeekMeetings();
        updateTimePosition();
        scrollToCurrentTime();

        const intervalId = setInterval(updateTimePosition, 60000);
        return () => clearInterval(intervalId);
    }, [weekStartDate]);

    // Watch for refresh trigger changes
    useEffect(() => {
        if (refreshTrigger > 0) {
            console.log("Refreshing weekly view due to trigger change:", refreshTrigger);
            fetchWeekMeetings(true); // Force fetch (invalidate cache)
        }
    }, [refreshTrigger]);

    // Update current time indicator position
    const updateTimePosition = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const basePosition = currentHour * 100 + currentMinutes * (100 / 60);
        const offset = 40; // height of .dayHeader
        setCurrentTimePosition(basePosition + offset);
    };

    // Scroll the grid so the current time starts ~2 hours into the visible area
    const scrollToCurrentTime = () => {
        if (viewContainerRef.current) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinutes = now.getMinutes();
            const dayHeaderOffset = 40; // height of .dayHeader, see updateTimePosition
            const scrollOffset = dayHeaderOffset + (currentHour * 100 + currentMinutes * (100 / 60)) - 200;
            viewContainerRef.current.scrollTop = Math.max(0, scrollOffset);
        }
    };

    // Get meetings for a specific day, filtered by room if applicable
    const getMeetingsForDay = (date: Date) => {
        const formattedDate = date.toISOString().split('T')[0];

        // Filter meetings by date, room/zoom-room, and calType/mode tags
        const filteredMeetings = allMeetings.filter(meeting => {
            const matchesDate = meeting.date === formattedDate;

            // A Hybrid meeting occupies both its physical room and its Zoom room, so it
            // should stay visible if either resource's filter is enabled.
            const isRoomIncluded =
                passesRoomFilter(meeting.room, filters) ||
                (!!meeting.zoomAccount && passesRoomFilter(meeting.zoomAccount, filters));

            return matchesDate && isRoomIncluded && passesTagFilters(meeting.tags, filters);
        });

        return layoutOverlappingMeetings(filteredMeetings);
    };

    // Get room color for a meeting (physical rooms have distinct colors; Zoom rooms are all gray)
    const getRoomColor = (meeting: Meeting) => {
        return ROOM_COLORS[meeting.room] ?? ZOOM_ROOM_COLOR;
    };

    // Check if a date is the current date
    const isCurrentDate = (date: Date): boolean => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    return (
        <div className={styles.outerContainer}>
            <div className={styles.viewContainer} ref={viewContainerRef}>
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
                                        primaryColor: getRoomColor(meeting)
                                    }))}
                                    setSelectedMeetingID={setSelectedMeetingID}
                                    setSelectedNewMeeting={setSelectedNewMeeting}
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
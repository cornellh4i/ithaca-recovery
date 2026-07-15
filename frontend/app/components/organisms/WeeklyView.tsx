import React, { useEffect, useState } from "react";
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

        // Group meetings by time to handle overlapping events
        const meetingsByTime: { [key: string]: Meeting[] } = {};
        filteredMeetings.forEach(meeting => {
            const timeKey = `${meeting.startTime}-${meeting.endTime}`;
            if (!meetingsByTime[timeKey]) {
                meetingsByTime[timeKey] = [];
            }
            meetingsByTime[timeKey].push(meeting);
        });

        // Process overlapping meetings to position them side-by-side
        const processedMeetings: Meeting[] = [];
        Object.values(meetingsByTime).forEach(overlappingMeetings => {
            if (overlappingMeetings.length > 1) {
                // Calculate width adjustment for overlapping meetings
                const totalMeetings = overlappingMeetings.length;
                overlappingMeetings.forEach((meeting, index) => {
                    // Clone the meeting to avoid modifying the original
                    const processedMeeting = { ...meeting };
                    // Add metadata for rendering position
                    (processedMeeting as any).positionIndex = index;
                    (processedMeeting as any).totalOverlapping = totalMeetings;
                    processedMeetings.push(processedMeeting);
                });
            } else if (overlappingMeetings.length === 1) {
                // If it's a single meeting, no adjustments needed
                processedMeetings.push(overlappingMeetings[0]);
            }
        });

        return processedMeetings;
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
            <div className={styles.viewContainer}>
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
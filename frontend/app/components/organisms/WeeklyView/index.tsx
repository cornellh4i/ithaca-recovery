import React, { useEffect, useState, useRef } from "react";
import styles from '../../../../styles/organisms/WeeklyView.module.scss';
import WeeklyViewColumn from "../../molecules/WeeklyViewColumn";
import { convertUTCToET } from "../../../../util/timeUtils";
import { IRecurrencePattern } from "../../../../util/models";

type Meeting = {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    date: string; // Added date field to track which day the meeting belongs to
    tags: string[];
    room: string; // Added room property
    isRecurring?: boolean; // Flag to indicate if this is a recurring meeting
    recurrencePattern?: IRecurrencePattern; // The recurrence pattern details
    primaryColor?: string; // Room color
    positionIndex?: number; // For overlapping meetings
    totalOverlapping?: number; // For overlapping meetings
};

// Default room colors
const roomColors: { [key: string]: string } = {
    'Serenity Room': '#b3ea75',
    'Seeds of Hope': '#f7e57b',
    'Unity Room': '#96dbfe',
    'Room for Improvement': '#ffae73',
    'Small but Powerful - Right': '#d2afff',
    'Small but Powerful - Left': '#ffa3c2',
    'Zoom Account 1': '#cecece',
    'Zoom Account 2': '#cecece',
    'Zoom Account 3': '#cecece',
    'Zoom Account 4': '#cecece',
};

// Get room color for a meeting
const getRoomColor = (roomName: string): string => {
    return roomColors[roomName] || "#cecece"; // Default to gray if room not found
};

const meetingCache = new Map<string, Meeting[]>();

const fetchMeetingsByWeek = async (startDate: Date): Promise<Meeting[]> => {
    // Format the date in local time to ensure correct calendar day
    const formattedDate = startDate.toLocaleDateString("en-CA"); // e.g., "2025-04-09"
    const cacheKey = `week-${formattedDate}`;

    if (meetingCache.has(cacheKey)) {
        console.log("Using cached data for week:", cacheKey);
        return meetingCache.get(cacheKey) || [];
    }

    console.log("Fetching meetings for week:", formattedDate);

    try {
        // Use the API endpoint with the start date
        const response = await fetch(`/api/retrieve/meeting/week?startDate=${formattedDate}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Raw API response:", data);

        const meetings: Meeting[] = data.map((meeting: Meeting) => {
            try {
                // Ensure startDateTime and endDateTime are valid
                if (!meeting.startDateTime || !meeting.endDateTime) {
                    console.error("Meeting missing datetime:", meeting);
                    return null;
                }

                // Convert UTC dates to Date objects
                const startUTC = new Date(meeting.startDateTime);
                const endUTC = new Date(meeting.endDateTime);
                
                // Validate dates
                if (isNaN(startUTC.getTime()) || isNaN(endUTC.getTime())) {
                    console.error("Invalid meeting dates:", meeting);
                    return null;
                }
                
                // Convert to ET timezone
                const startEDT = convertUTCToET(startUTC.toISOString());
                const endEDT = convertUTCToET(endUTC.toISOString());
                
                // Create Date objects from ET strings
                const startDate = new Date(startEDT);
                const endDate = new Date(endEDT);
                
                // Format times for display
                const formattedStartTime = startDate.toLocaleTimeString("en-US", { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                });
                
                const formattedEndTime = endDate.toLocaleTimeString("en-US", { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                });
                
                return {
                    id: meeting.mid,
                    title: meeting.title || "Untitled Meeting",
                    startTime: formattedStartTime,
                    endTime: formattedEndTime,
                    date: startDate.toISOString().split('T')[0], // Store the date of the meeting
                    tags: [meeting.calType, meeting.modeType].filter(Boolean), // Filter out undefined values
                    room: meeting.room || "Unknown Room",
                    isRecurring: meeting.isRecurring || false,
                    recurrencePattern: meeting.recurrencePattern || null,
                    primaryColor: getRoomColor(meeting.room) // Add room color directly
                };
            } catch (error) {
                console.error("Error processing meeting:", meeting, error);
                return null;
            }
        }).filter(Boolean); // Remove null meetings
        
        console.log("Processed meetings:", meetings);
        meetingCache.set(cacheKey, meetings);
        return meetings;
    } catch (error) {
        console.error("Error fetching weekly meetings:", error);
        return [];
    }
};

// Get the first day (Sunday) of the week containing the provided date
const getFirstDayOfWeek = (date: Date): Date => {
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
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
}

const WeeklyView: React.FC<WeeklyViewProps> = ({
    filters,
    selectedDate,
    setSelectedDate,
    setSelectedMeetingID,
    setSelectedNewMeeting
}) => {
    const [currentTimePosition, setCurrentTimePosition] = useState(0);
    const [weekStartDate, setWeekStartDate] = useState<Date>(getFirstDayOfWeek(selectedDate));
    const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
    const [daysOfWeek, setDaysOfWeek] = useState<Date[]>(getDaysOfWeek(weekStartDate));
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Format time slots for hour markers
    const formatTime = (hour: number): string => {
        const period = hour >= 12 ? "PM" : "AM";
        const formattedHour = hour % 12 || 12;
        return `${formattedHour} ${period}`;
    };

    const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

    // Update the week when selected date changes
    useEffect(() => {
        const newWeekStartDate = getFirstDayOfWeek(selectedDate);
        setWeekStartDate(newWeekStartDate);
        setDaysOfWeek(getDaysOfWeek(newWeekStartDate));
    }, [selectedDate]);

    // Fetch meetings for the entire week
    useEffect(() => {
        const fetchWeekMeetings = async () => {
            const meetings = await fetchMeetingsByWeek(weekStartDate);
            setAllMeetings(meetings);
        };

        fetchWeekMeetings();
        updateTimePosition();

        const intervalId = setInterval(updateTimePosition, 60000);
        return () => clearInterval(intervalId);
    }, [weekStartDate]);

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

        // Filter meetings by date and apply room and tag filters
        const filteredMeetings = allMeetings.filter(meeting => {
            const matchesDate = meeting.date === formattedDate;
            const room = meeting.room;

            // Check if room is in filters
            const roomKey = room.replace(/[-\s]+/g, '').replace(/\s+/g, '');
            const isRoomIncluded = filters[roomKey] !== false;

            // Check if all tags are included
            const areTagsIncluded = meeting.tags.every(tag => {
                const normalizedTag = tag ? tag.replace(/[-\s]+/g, '').replace(/\s+/g, '') : '';
                return normalizedTag === '' || filters[normalizedTag] !== false;
            });

            return matchesDate && isRoomIncluded && areTagsIncluded;
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
                    processedMeeting.positionIndex = index;
                    processedMeeting.totalOverlapping = totalMeetings;
                    processedMeetings.push(processedMeeting);
                });
            } else if (overlappingMeetings.length === 1) {
                // If it's a single meeting, no adjustments needed
                processedMeetings.push(overlappingMeetings[0]);
            }
        });

        return processedMeetings;
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
                <div 
                    ref={scrollContainerRef}
                    className={styles.daysContainer}
                >
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
                                {/* Only render our custom header */}
                                {customHeader}

                                {/* Render meetings with the improved component */}
                                <WeeklyViewColumn
                                    dayName=""  // Empty string to prevent WeeklyViewColumn from rendering its own header
                                    date=""     // Empty string for the same reason
                                    roomColor="#cecece" // Default color
                                    meetings={dayMeetings}
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
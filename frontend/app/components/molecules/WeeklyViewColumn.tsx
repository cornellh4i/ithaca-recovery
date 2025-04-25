import React from 'react';
import BoxText from '../atoms/BoxText';

interface Meeting {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    tags?: string[];
    room?: string;
    primaryColor?: string;
    positionIndex?: number;
    totalOverlapping?: number;
}

interface WeeklyViewColumnProps {
    roomColor: string;
    meetings: Meeting[];
    setSelectedMeetingID: (meetingId: string) => void;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
    dayName: string;
    date: string;
}

// Helper function to safely parse time strings
const parseTimeString = (timeStr: string): { hours: number; minutes: number } => {
    if (!timeStr || typeof timeStr !== 'string') {
        console.error("Invalid time string:", timeStr);
        return { hours: 0, minutes: 0 }; // Default to midnight
    }
    
    try {
        // Handle formats like "10:30 AM", "10:30 PM", "22:30"
        let hours = 0;
        let minutes = 0;
        
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':');
            hours = parseInt(parts[0], 10);
            
            // Extract minutes, handling cases with seconds or AM/PM
            if (parts[1]) {
                const minutePart = parts[1].split(' ')[0];
                minutes = parseInt(minutePart, 10);
            }
            
            // Handle AM/PM
            if (timeStr.toLowerCase().includes('pm') && hours < 12) {
                hours += 12;
            } else if (timeStr.toLowerCase().includes('am') && hours === 12) {
                hours = 0;
            }
        } else {
            console.error("Unrecognized time format:", timeStr);
            return { hours: 0, minutes: 0 };
        }
        
        if (isNaN(hours) || isNaN(minutes)) {
            console.error("Failed to parse time parts:", timeStr);
            return { hours: 0, minutes: 0 };
        }
        
        return { hours, minutes };
    } catch (error) {
        console.error("Error parsing time string:", timeStr);
        return { hours: 0, minutes: 0 };
    }
};

// Enhanced timeToPixels function with better error handling
const timeToPixels = (time: string): number => {
    if (!time || time.includes('NaN')) {
        console.warn(`Invalid time format: ${time}, defaulting to midnight`);
        return 0;
    }
    
    try {
        const { hours, minutes } = parseTimeString(time);
        return (hours * 100) + (minutes * (100/60)); // Convert time to pixels (100px per hour)
    } catch (error) {
        console.error(`Error converting time to pixels: ${time}`, error);
        return 0; // Default to midnight
    }
};

// Enhanced formatTime function with better error handling
const formatTime = (time: string): string => {
    if (!time || time.includes('NaN')) {
        return "12:00 AM"; // Default display time
    }
    
    try {
        const { hours, minutes } = parseTimeString(time);
        const period = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 || 12;
        const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
        return `${formattedHours}:${formattedMinutes} ${period}`;
    } catch (error) {
        console.error(`Error formatting time: ${time}`, error);
        return "12:00 AM"; // Default display time
    }
};

const WeeklyViewColumn: React.FC<WeeklyViewColumnProps> = ({
    roomColor,
    meetings,
    setSelectedMeetingID,
    setSelectedNewMeeting,
    dayName,
    date,
}) => {
    const handleBoxClick = (meetingId: string) => {
        console.log(`Meeting ${meetingId} clicked`);
        setSelectedMeetingID(meetingId);
        setSelectedNewMeeting(false);
    };

    // Filter out invalid meetings
    const validMeetings = meetings.filter(meeting => {
        if (!meeting || !meeting.startTime || !meeting.endTime) {
            console.warn("Skipping invalid meeting:", meeting);
            return false;
        }
        
        // Check if time contains NaN
        if (meeting.startTime.includes('NaN') || meeting.endTime.includes('NaN')) {
            console.warn("Meeting has invalid time:", meeting);
            return false;
        }
        
        return true;
    });

    return (
        <div className="flex flex-col h-full w-full">
            {/* Day header */}
            {dayName && date && (
                <div className="text-center py-2 font-medium border-b border-gray-200">
                    <div>{dayName}</div>
                    <div className="text-sm text-gray-500">{date}</div>
                </div>
            )}

            {/* Column body */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '2400px', // 24 hours * 100px per hour
                    borderRight: '1px solid #e5e7eb',
                    cursor: "pointer"
                }}
            >
                {/* Render hour markers */}
                {Array.from({ length: 24 }).map((_, hourIndex) => (
                    <div
                        key={hourIndex}
                        style={{
                            position: 'absolute',
                            top: `${hourIndex * 100}px`,
                            width: '100%',
                            borderTop: '1px solid #e5e7eb',
                            height: '100px'
                        }}
                    />
                ))}

                {validMeetings.map((meeting, index) => {
                    // Calculate positioning with improved error handling
                    const topOffset = timeToPixels(meeting.startTime);
                    const bottomOffset = timeToPixels(meeting.endTime);
                    
                    // Ensure height is positive and at least 30px
                    let height = bottomOffset - topOffset;
                    if (height <= 0) {
                        // Handle case where end time is earlier than start time (overnight meeting)
                        height = (2400 - topOffset) + bottomOffset;
                    }
                    height = Math.max(height, 30); // Minimum height of 30px

                    // Handle overlapping meetings
                    let width = '90%';
                    let left = '5%';

                    if (meeting.totalOverlapping && meeting.totalOverlapping > 1) {
                        const singleWidth = 90 / meeting.totalOverlapping; // Percentage width for each meeting
                        width = `${singleWidth}%`;

                        // Calculate left position based on index
                        const leftPosition = 5 + (meeting.positionIndex || 0) * singleWidth;
                        left = `${leftPosition}%`;
                    }

                    return (
                        <div
                            key={index}
                            style={{
                                position: 'absolute',
                                top: `${topOffset}px`,
                                height: `${height}px`,
                                width: width,
                                left: left,
                                borderRadius: '6px',
                                zIndex: 10
                            }}
                            onClick={(e) => e.stopPropagation()} // Prevent column click handler from firing
                        >
                            <BoxText
                                boxType="Meeting Block"
                                title={meeting.title}
                                primaryColor={meeting.primaryColor || roomColor}
                                time={`${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}`}
                                tags={meeting.tags}
                                meetingId={meeting.id}
                                onClick={(meetingId, e) => {
                                    handleBoxClick(meetingId);
                                    e.stopPropagation(); // Prevent column click handler from firing
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WeeklyViewColumn;
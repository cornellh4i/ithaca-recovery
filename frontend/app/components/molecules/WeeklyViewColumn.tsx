import React from 'react';
import BoxText from '../atoms/BoxText';

interface Meeting {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    tags?: string[];
    room?: string; // Added room property
    primaryColor?: string; // Added to support different colored meetings
    positionIndex?: number; // For handling overlapping meetings
    totalOverlapping?: number; // For handling overlapping meetings
}

interface WeeklyViewColumnProps {
    roomColor: string;
    meetings: Meeting[];
    setSelectedMeetingID: (meetingId: string) => void;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
    dayName: string;
    date: string;
}

// 1 hour is 100px in height
const timeToPixels = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 100 + minutes); // Convert time to pixels (1px = 1min)
};

const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${formattedHours}:${formattedMinutes} ${period}`;
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

    return (
        <div className="flex flex-col h-full w-full">
            {/* Day header */}
            <div className="text-center py-2 font-medium border-b border-gray-200">
                <div>{dayName}</div>
                <div className="text-sm text-gray-500">{date}</div>
            </div>

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

                {meetings.map((meeting, index) => {
                    const topOffset = timeToPixels(meeting.startTime);
                    const bottomOffset = timeToPixels(meeting.endTime);
                    const height = bottomOffset - topOffset;

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
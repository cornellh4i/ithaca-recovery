import React from 'react';
import BoxText from '../../atoms/BoxText';

interface Meeting {
  title: string;
  startTime: string;
  endTime: string;
  tags?: string[];
  id: string;
}

interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
}

// 1 hour is 155px
const timeToPixels = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60 + minutes) * (155 / 60); // Convert time to pixels
};

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
  return `${formattedHours}:${formattedMinutes} ${period}`;
};

const DailyViewRow: React.FC<DailyViewRowProps> = ({
  roomColor,
  meetings,
  setSelectedMeetingID,
  setSelectedNewMeeting,
}) => {
  const handleBoxClick = (meetingId: string) => {
    console.log(`Meeting ${meetingId} clicked`);
    setSelectedMeetingID(meetingId);
    setSelectedNewMeeting(false);

  };

  return (
    <div
      style={{ cursor: "pointer", position: 'relative', width: '100%', height: '100%' }}

    >
      <div>
        {/* Render 24-hour blocks */}
        {Array.from({ length: 24 }).map((_, colIndex) => (
          <div key={colIndex}></div>
        ))}

        {meetings.map((meeting, index) => {
          const startOffset = timeToPixels(meeting.startTime);
          const endOffset = timeToPixels(meeting.endTime);
          const width = endOffset - startOffset;

          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: `${startOffset}px`,
                width: `${width}px`,
                borderRadius: '6px',
              }}
              onClick={(e) => e.stopPropagation()} // Prevent row click handler from firing
            >
              <BoxText
                boxType="Meeting Block"
                title={meeting.title}
                primaryColor={roomColor}
                time={`${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}`}
                tags={meeting.tags}
                meetingId={meeting.id}
                onClick={(meetingId, e) => {
                  handleBoxClick(meetingId);
                  e.stopPropagation(); // Prevent row click handler from firing
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyViewRow;

import React from 'react';
import BoxText from '../atoms/BoxText';

interface Meeting {
  title: string;
  startTime: string;
  endTime: string;
  tags?: string[];
}

interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
}

// 1 hour is 155px
const timeToPixels = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60 + minutes) * (155 / 60); // Convert time to pixels
};

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
  return `${formattedHours}:${formattedMinutes} ${period}`;
};

const DailyViewRow: React.FC<DailyViewRowProps> = ({ roomColor, meetings }) => {

  // Dummy function for onClick prop
  const handleBoxClick = (meetingId: string) => {
    console.log(`Meeting ${meetingId} clicked`);
  };
  
  return (
    <div>
      <div>
        {Array.from({ length: 24 }).map((_, colIndex) => (
          <div key={colIndex} ></div>
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
                borderRadius: "6px",
              }}
            >
              <BoxText 
                boxType="Meeting Block"
                title={meeting.title}
                primaryColor={roomColor}
                time={`${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}`}
                tags={meeting.tags}
                meetingId="id"
                onClick={handleBoxClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyViewRow;

import React from 'react';
import BoxText from '../atoms/BoxText';

// Meeting Interface
interface Meeting {
  title: string;
  startTime: string; // Raw UTC timestamp (ISO 8601 format)
  endTime: string;   // Raw UTC timestamp (ISO 8601 format)
  tags?: string[];
  id: string;
}

// DailyViewRowProps Interface
interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
}

const timeToPixels = (datetime: string) => {
  // Create Date object from raw UTC timestamp
  const utcDate = new Date(datetime);

  // Convert to EDT using toLocaleString with 'America/New_York' timezone
  const edtDatetime = utcDate.toLocaleString("en-US", { timeZone: "America/New_York" });

  // Extract date and time components from the converted EDT time string
  const [datePart, timePart] = edtDatetime.split(', ');
  const [hour, minute] = timePart.split(':');
  const edtHours = parseInt(hour);
  const edtMinutes = parseInt(minute);

  // Extract AM/PM
  const period = timePart.split(' ')[1];  // 'AM' or 'PM'

  // Convert 12-hour format to 24-hour format
  let adjustedHours = edtHours;
  if (period === 'AM' && edtHours === 12) {
    adjustedHours = 0; // Handle 12 AM as 0 hours
  } else if (period === 'PM' && edtHours !== 12) {
    adjustedHours = edtHours + 12; // Convert PM hours (except 12 PM)
  }

  // Calculate the total minutes since 12:00 AM
  const totalMinutes = adjustedHours * 60 + edtMinutes;

  // Convert minutes to pixels (1 hour = 155px)
  return totalMinutes * (155 / 60);  // Pixel scale factor based on minutes per hour
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
    <div style={{ cursor: "pointer", position: 'relative', width: '100%', height: '100%' }}>
      <div>
        {/* Render 24-hour blocks */}
        {Array.from({ length: 24 }).map((_, colIndex) => (
          <div key={colIndex}></div>
        ))}

        {/* Render meetings */}
        {meetings.map((meeting, index) => {
          // Convert times to EDT before calculating pixels
          const startOffset = timeToPixels(meeting.startTime);
          const endOffset = timeToPixels(meeting.endTime);
          const width = endOffset - startOffset;

          // Convert startTime and endTime to EDT for display
          const startTimeEDT = new Date(meeting.startTime).toLocaleString("en-US", { timeZone: "America/New_York" });
          const endTimeEDT = new Date(meeting.endTime).toLocaleString("en-US", { timeZone: "America/New_York" });

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
                time={`${startTimeEDT} - ${endTimeEDT}`}  // Display start and end time in EDT
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

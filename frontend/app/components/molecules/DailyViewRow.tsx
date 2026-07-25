import React from 'react';
import BoxText from '../atoms/BoxText';
import { formatCompactTimeRange } from '../../../util/timeFormat';

// Extracts ET wall-clock time as 24hr "HH:MM", the format formatCompactTimeRange expects.
const et24HourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

// Meeting Interface
interface Meeting {
  title: string;
  startTime: string; // clipped to this day, for positioning
  endTime: string; // clipped to this day, for positioning
  displayStartTime?: string; // true time, for the label
  displayEndTime?: string; // true time, for the label
  tags?: string[];
  id: string;
  syncError?: boolean;
}

// DailyViewRowProps Interface
interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
}

const timeToPixels = (datetime: string) => {
  // Create Date object from raw UTC timestamp
  const utcDate = new Date(datetime);

  // Convert to EDT using toLocaleString with 'America/New_York' timezone
  const edtDatetime = utcDate.toLocaleString("en-US", { timeZone: "America/New_York" });

  // Extract date and time components from the converted EDT time string
  const [, timePart] = edtDatetime.split(', ');
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
  selectedMeetingID,
  setSelectedMeetingID,
  setSelectedNewMeeting,
  setAnchorEl,
}) => {

  const handleBoxClick = (meetingId: string, el: HTMLElement) => {
    console.log(`Meeting ${meetingId} clicked`);
    setSelectedMeetingID(meetingId);
    setSelectedNewMeeting(false);
    setAnchorEl(el);
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

          // Compact ET display (e.g. "9-10AM", "9-9:30AM", "11AM-12:30PM") — uses the true,
          // unclipped time so a split overnight meeting still labels the same on both halves.
          const compactTime = formatCompactTimeRange(
            et24HourFmt.format(new Date(meeting.displayStartTime ?? meeting.startTime)),
            et24HourFmt.format(new Date(meeting.displayEndTime ?? meeting.endTime)),
          );

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
                time={compactTime}
                tags={meeting.tags}
                meetingId={meeting.id}
                syncError={meeting.syncError}
                selected={meeting.id === selectedMeetingID}
                onClick={(meetingId, e) => {
                  handleBoxClick(meetingId, e.currentTarget);
                  e.stopPropagation();
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

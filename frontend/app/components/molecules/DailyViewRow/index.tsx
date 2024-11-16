import React, { useState } from 'react';
import BoxText from '../../atoms/BoxText';
import NewMeetingSidebar from '../../organisms/NewMeeting';

interface Meeting {
  title: string;
  startTime: string;
  endTime: string;
  tags?: string[];
}

interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
  setSelectedMeetingID: (meetingId: string) => void;
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

const DailyViewRow: React.FC<DailyViewRowProps> = ({ roomColor, meetings, setSelectedMeetingID }) => {
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [detailPosition, setDetailPosition] = useState({ x: 0, y: 0 });

  // Function to handle clicks on BoxText elements
  const handleBoxClick = (meetingId: string) => {
    console.log(`Meeting ${meetingId} clicked`);
    setSelectedMeetingID(meetingId); // Notify parent about the selected meeting
    setIsDetailVisible(false); // Ensure NewMeetingDetail is hidden
  };

  // Function to handle clicks outside BoxText
  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.box-text')) return; // Ignore clicks on BoxText

    const { clientX: x, clientY: y } = e;
    setDetailPosition({ x, y });
    setIsDetailVisible(true); // Show NewMeetingDetail
  };

  return (
    <div
      style={{ position: 'relative' }}
      onClick={handleOutsideClick} // Handle outside clicks
    >
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
          >
            <BoxText
              className="box-text"
              boxType="Meeting Block"
              title={meeting.title}
              primaryColor={roomColor}
              time={`${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}`}
              tags={meeting.tags}
              meetingId="2024-05-01T23:30:27.987Z"
              onClick={(meetingId) => handleBoxClick(meetingId)}
            />
          </div>
        );
      })}

      {isDetailVisible && (
        <NewMeetingSidebar
          meetingTitleTextField={<div>Meeting Title</div>}
          DatePicker={<div>Date Picker</div>}
          TimePicker={<div>Time Picker</div>}
          RadioGroup={<div>Radio Group</div>}
          roomSelectionDropdown={<div>Room Dropdown</div>}
          meetingTypeDropdown={<div>Meeting Type Dropdown</div>}
          zoomAccountDropdown={<div>Zoom Dropdown</div>}
          emailTextField={<div>Email Text Field</div>}
          uploadPandaDocsForm={<div>PandaDocs Form</div>}
          descriptionTextField={<div>Description Text Field</div>}
          // style={{
          //   position: 'absolute',
          //   top: `${detailPosition.y}px`,
          //   left: `${detailPosition.x}px`,
          // }}
        />
      )}
    </div>
  );
};

export default DailyViewRow;

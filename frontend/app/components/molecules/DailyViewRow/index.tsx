import React from "react";
import BoxText from "../../atoms/BoxText";

interface MeetingBlock {
  title: string;
  startTime: string; 
  endTime: string; 
  primaryColor: string;
  tags?: string[];
}

interface DailyViewRowProps {
  roomName: string;
  roomColor: string;
  meetings: MeetingBlock[];
}

const pixelsPerHour = 186;

function calculateOffset(startTime: string): number {
  const [hours, minutes] = startTime.split(":").map(Number);
  const hoursSinceStart = hours - 7;
  return hoursSinceStart * pixelsPerHour + (minutes / 60) * pixelsPerHour;
}

const DailyViewRow: React.FC<DailyViewRowProps> = ({ roomName, roomColor, meetings }) => {
  return (
    <div style={{ display: "flex", position: "relative", height: "60px", borderBottom: "1px solid #ddd" }}>
      <BoxText boxType="Room Block" title={roomName} primaryColor={roomColor} />
      <div style={{ position: "relative", flexGrow: 1, display: "grid", gridTemplateColumns: "repeat(9, 1fr)" }}>
        {meetings.map((meeting, index) => {
          const offsetLeft = calculateOffset(meeting.startTime);
          const width = calculateOffset(meeting.endTime) - offsetLeft;
          return (
            <BoxText
              key={index}
              boxType="Meeting Block"
              title={meeting.title}
              primaryColor={meeting.primaryColor}
              time={`${meeting.startTime} - ${meeting.endTime}`}
              tags={meeting.tags}
              style={{
                position: "absolute",
                left: `${offsetLeft}px`,
                width: `${width}px`,
                height: "100%",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default DailyViewRow;

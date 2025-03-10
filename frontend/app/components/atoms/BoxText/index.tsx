import React from "react";
import styles from "../../../../styles/components/atoms/BoxText.module.scss";

interface BoxProps {
  boxType: "Meeting Block" | "Room Block" | "Calendar Day";
  title: string;
  primaryColor: string;
  time?: string; // For Meeting Block
  tags?: string[]; // For badges like "Hybrid", "AA"
  meetingId: string;
  date?: number;
  view?: "monthly" | "weekly" | "daily";
  meetings?: Array<{
    time: string;
    title: string;
    room: string;
    id: string;
  }>;
  onClick: (
    meetingId: string,
    e: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => void;
  [key: string]: any;
}

const BoxText: React.FC<BoxProps> = ({
  boxType,
  title,
  primaryColor,
  time,
  tags,
  meetingId,
  view,
  meetings,
  room,
  id,
  date,
  onClick,
}) => {
  // Function to convert hex to RGB
  const hexToRgb = (hex: string) => {
    hex = hex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b };
  };

  // Function to parse RGB string to an object
  const rgbStringToObject = (rgb: string) => {
    const values = rgb.match(/\d+/g);
    if (!values || values.length < 3) {
      console.log(
        "Invalid RGB string format. Please provide a valid rgb(R, G, B) string."
      );
      return { r: 0, g: 0, b: 0 }; // Return default values
    }
    return {
      r: parseInt(values[0]),
      g: parseInt(values[1]),
      b: parseInt(values[2]),
    };
  };

  // Function to lighten the color and return a pastel version
  const toPastelColor = (color: string) => {
    let r, g, b;

    if (color.startsWith("#")) {
      // If color is in hex format
      ({ r, g, b } = hexToRgb(color));
    } else if (color.startsWith("rgb")) {
      // If color is in RGB format
      ({ r, g, b } = rgbStringToObject(color));
    } else {
      throw new Error(
        "Invalid color format. Please provide a hex or RGB color."
      );
    }

    // Lighten the color
    const pastelR = Math.round(r + (255 - r) * 0.7);
    const pastelG = Math.round(g + (255 - g) * 0.7);
    const pastelB = Math.round(b + (255 - b) * 0.7);

    return `rgb(${pastelR}, ${pastelG}, ${pastelB})`; // Return pastel color in RGB format
  };

  const bgColor =
    boxType === "Meeting Block" || "Calendar Day" ? toPastelColor(primaryColor) : primaryColor;

  const isToday = () => {
    if (!date) return false;
    const today = new Date();
    return date === today.getDate();
  };

  const isPastDay = () => {
    if (!date) return false;
    const today = new Date();
    return date < today.getDate();
  };

  if (
    boxType === "Calendar Day" &&
    view === "monthly" &&
    meetings?.length != null
  ) {
    const sortedMeetings = [...meetings].sort((a, b) => {
      const timeA = a.time.toLowerCase();
      const timeB = b.time.toLowerCase();

      const isAMA = timeA.includes("am");
      const isPMA = timeA.includes("pm");
      const isAMB = timeB.includes("am");
      const isPMB = timeB.includes("pm");

      const hourA = parseInt(timeA.match(/\d+/)[0], 10);
      const hourB = parseInt(timeB.match(/\d+/)[0], 10);

      let hour24A = hourA;
      if (isPMA && hourA < 12) hour24A += 12;
      if (isAMA && hourA === 12) hour24A = 0;

      let hour24B = hourB;
      if (isPMB && hourB < 12) hour24B += 12;
      if (isAMB && hourB === 12) hour24B = 0;

      return hour24A - hour24B;
    });

    const maxMeetingsVisible = sortedMeetings.length > 5 ? 4 : 5;
    const visibleMeetings = sortedMeetings.slice(0, maxMeetingsVisible);
    const hasMoreMeetings = sortedMeetings.length > maxMeetingsVisible;
    const moreCount = sortedMeetings.length - maxMeetingsVisible;

    const dayClassName = `${styles.calendarDay} ${
      isPastDay() ? styles.pastDay : ""
    }`;

    return (
      <div className={dayClassName}>
        <div className={isToday() ? styles.todayNumber : styles.dateNumber}>
          {date}
        </div>
        <div className={styles.meetingsList}>
          {visibleMeetings.map((meeting, index) => {

            const roomColor = primaryColor;
            const meetingBgColor = toPastelColor(roomColor);
            
            return (
              <div
                key={index}
                className={styles.meetingItem}
                onClick={(e) => {
                  e.stopPropagation();
                  onClick(meeting.id, e);
                }}
                style={{
                  backgroundColor: meetingBgColor,
                  borderLeft: `7px solid ${roomColor}`,
                }}
              >
                <div className="eventDetails">
                  <span className={styles.meetingTime}>{meeting.time}</span>
                  <span className={styles.meetingTitle}>{meeting.title}</span>
                </div>
              </div>
            );
          })}
          {hasMoreMeetings && (
            <div className={styles.moreMeetings}>{moreCount} more</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.box} ${
        boxType === "Meeting Block" ? styles.meeting : styles.room
      }`}
      style={{
        backgroundColor: bgColor,
        borderLeft: `7px solid ${primaryColor}`,
      }}
      onClick={(e) => onClick(meetingId, e)}
    >
      <h3 className={styles.title}>{title}</h3>

      {boxType === "Meeting Block" && <p className={styles.time}>{time}</p>}
      {tags && tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((tag, index) => (
            <span
              key={index}
              style={{ backgroundColor: primaryColor }}
              className={styles.tag}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default BoxText;

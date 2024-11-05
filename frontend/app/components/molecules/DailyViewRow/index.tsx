import React from 'react';
import styles from '../../../../styles/components/molecules/DailyViewRow.module.scss';
import BoxText from '../../atoms/BoxText';

interface Meeting {
  title: string;
  startTime: string;
  endTime: string;
  tags?: string[];
}

// 1 hour is 155px
const timeToPixels = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60 + minutes) * (155 / 60); // Convert time to pixels
};

interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
}

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
  return `${formattedHours}:${formattedMinutes} ${period}`;
};

const hexToRgb = (hex: string) => {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return { r, g, b };
};

// Function to parse RGB string to an object
const rgbStringToObject = (rgb: string) => {
  const values = rgb.match(/\d+/g);
  if (!values || values.length < 3) {
    console.log('Invalid RGB string format. Please provide a valid rgb(R, G, B) string.');
    return { r: 0, g: 0, b: 0 }; // Return default values
  }
  return { r: parseInt(values[0]), g: parseInt(values[1]), b: parseInt(values[2]) };
};

// Function to lighten the color and return a pastel version
const toPastelColor = (color: string) => {
  let r, g, b;

  if (color.startsWith('#')) {
    // If color is in hex format
    ({ r, g, b } = hexToRgb(color));
  } else if (color.startsWith('rgb')) {
    // If color is in RGB format
    ({ r, g, b } = rgbStringToObject(color));
  } else {
    throw new Error('Invalid color format. Please provide a hex or RGB color.');
  }

  // Lighten the color
  const pastelR = Math.round(r + (255 - r) * 0.7);
  const pastelG = Math.round(g + (255 - g) * 0.7);
  const pastelB = Math.round(b + (255 - b) * 0.7);

  return `rgb(${pastelR}, ${pastelG}, ${pastelB})`; // Return pastel color in RGB format
};

const DailyViewRow: React.FC<DailyViewRowProps> = ({ roomColor, meetings }) => {
  return (
    <div className={styles.rowContainer}>
      <div className={styles.gridRow}>
        {Array.from({ length: 24 }).map((_, colIndex) => (
          <div key={colIndex} className={styles.gridCell}></div>
        ))}

        {meetings.map((meeting, index) => {
          const startOffset = timeToPixels(meeting.startTime);
          const endOffset = timeToPixels(meeting.endTime);
          const width = endOffset - startOffset;

          return (
            <div
              key={index}
              className={styles.meetingBlock}
              style={{
                position: 'absolute',
                left: `${startOffset}px`,
                width: `${width}px`,
                backgroundColor: toPastelColor(roomColor),
              }}
            >
              <BoxText 
                boxType="Meeting Block"
                title={meeting.title}
                primaryColor={roomColor}
                time={`${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}`}
                tags={meeting.tags}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyViewRow;

import React from "react";
import styles from '../../../../styles/components/atoms/BoxText.module.scss';

interface BoxProps {
  boxType: 'Meeting Block' | 'Room Block';
  title: string;
  primaryColor: string;
  time?: string; // For Meeting Block
  tags?: string[]; // For badges like "Hybrid", "AA"
  meetingId: string;
  onClick: (meetingId: string, e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  [key: string]: any;
};

const BoxText: React.FC<BoxProps> = ({ boxType, title, primaryColor, time, tags, meetingId, onClick }) => {

  // Function to convert hex to RGB
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

  const bgColor =
    boxType === 'Meeting Block'
      ? toPastelColor(primaryColor)
      : primaryColor;

  return (
    <div
      className={`${styles.box} ${boxType === 'Meeting Block' ? styles.meeting : styles.room}`}
      style={{ backgroundColor: bgColor, borderLeft: `7px solid ${primaryColor}` }}
      onClick={(e) => onClick(meetingId, e)}
    >
      <h3 className={styles.title}>{title}</h3>

      {boxType === 'Meeting Block' && <p className={styles.time}>{time}</p>}
      {tags && tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((tag, index) => (
            <span key={index}
              style={{ backgroundColor: primaryColor }}
              className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default BoxText;
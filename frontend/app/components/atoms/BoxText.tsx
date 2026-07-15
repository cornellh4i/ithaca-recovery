import React, { useLayoutEffect, useRef, useState } from "react";
import styles from '../../../styles/components/atoms/BoxText.module.scss';

interface BoxProps {
  boxType: 'Meeting Block' | 'Room Block';
  title: string;
  primaryColor: string;
  time?: string; // For Meeting Block
  tags?: string[]; // For badges like "Hybrid", "AA"
  meetingId: string;
  syncError?: boolean;
  // Stretch to fill the parent's height instead of the fixed Meeting Block height —
  // used by WeeklyView, where the wrapping div's height already encodes the meeting's
  // duration (DailyView instead encodes duration as width, on a fixed-height row).
  fillHeight?: boolean;
  // Extra badge alongside tags, e.g. flagging a Zoom-room mismatch.
  zoomTag?: string;
  onClick: (meetingId: string, e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  [key: string]: any;
};

const BoxText: React.FC<BoxProps> = ({
  boxType,
  title,
  primaryColor,
  time,
  tags,
  meetingId,
  syncError = false,
  fillHeight = false,
  zoomTag,
  onClick
}) => {

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

  // Measures the zoomTag badge's actual rendered width so the title reserves exactly
  // that much space (plus its own right offset).
  const zoomTagRef = useRef<HTMLSpanElement>(null);
  const [titlePaddingRight, setTitlePaddingRight] = useState<number>();

  useLayoutEffect(() => {
    if (!zoomTag || !zoomTagRef.current) {
      setTitlePaddingRight(undefined);
      return;
    }

    const zoomTagEl = zoomTagRef.current;
    // The title already stretches to (box right edge - .meeting's 16px right padding),
    // while .zoomTag sits at (box right edge - its own 8px `right` offset).
    const headStart = 16 - 8;
    const updatePadding = () => setTitlePaddingRight(zoomTagEl.offsetWidth - headStart);

    updatePadding();
    const observer = new ResizeObserver(updatePadding);
    observer.observe(zoomTagEl);
    return () => observer.disconnect();
  }, [zoomTag]);

  return (
    <div
      className={`${styles.box} ${boxType === 'Meeting Block' ? styles.meeting : styles.room} ${fillHeight ? styles.fillHeight : ''}`}
      style={{ backgroundColor: bgColor, borderLeft: `7px solid ${primaryColor}`, position: 'relative' }}
      onClick={(e) => onClick(meetingId, e)}
    >
      {syncError && (
        <span title="Google Calendar sync failed" className={styles.syncError}>
          ⚠
        </span>
      )}
      {zoomTag && (
        <span ref={zoomTagRef} className={styles.zoomTag} title={`Zoom room: ${zoomTag}`}>
          <img src="/svg/zoom-icon.svg" alt="" className={styles.zoomTagIcon} />
          {zoomTag}
        </span>
      )}
      <h3 className={styles.title} style={titlePaddingRight ? { paddingRight: titlePaddingRight } : undefined}>
        {title}
      </h3>

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
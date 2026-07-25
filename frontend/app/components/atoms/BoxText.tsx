import React, { useLayoutEffect, useRef, useState } from "react";
import styles from '../../../styles/components/atoms/BoxText.module.scss';
import { toPastelColor } from '../../../util/color';

interface BoxProps {
  boxType: 'Meeting Block' | 'Room Block';
  title: string;
  primaryColor: string;
  time?: string; // For Meeting Block
  tags?: string[]; // For badges like "Hybrid", "AA"
  meetingId: string;
  syncError?: boolean;
  // Highlights the box (drop shadow) while its View Meeting popup is open.
  selected?: boolean;
  // Stretch to fill the parent's height instead of the fixed Meeting Block height —
  // used by WeeklyView, where the wrapping div's height already encodes the meeting's
  // duration (DailyView instead encodes duration as width, on a fixed-height row).
  fillHeight?: boolean;
  // Extra badge alongside tags, e.g. flagging a Zoom-room mismatch.
  zoomTag?: string;
  onClick: (meetingId: string, e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  [key: string]: unknown;
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
  selected = false,
  onClick
}) => {

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
      data-testid={boxType === 'Meeting Block' ? `meeting-card-${meetingId}` : undefined}
      className={`${styles.box} ${boxType === 'Meeting Block' ? styles.meeting : styles.room} ${fillHeight ? styles.fillHeight : ''} ${selected ? styles.selected : ''}`}
      style={{ backgroundColor: bgColor, borderLeft: `6px solid ${primaryColor}`, position: 'relative' }}
      onClick={(e) => onClick(meetingId, e)}
    >
      {syncError && (
        <span title="Sync failed" className={styles.syncError}>
          ⚠
        </span>
      )}
      {zoomTag && (
        <span ref={zoomTagRef} className={styles.zoomTag} title={`Zoom room: ${zoomTag}`}>
          <img src="/svg/video-call-icon.svg" alt="" className={styles.zoomTagIcon} />
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
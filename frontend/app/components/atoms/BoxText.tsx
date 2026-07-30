import React, { useLayoutEffect, useRef, useState } from "react";
import styles from '../../../styles/components/atoms/BoxText.module.scss';
import { toPastelColor } from '../../../util/color';
import TagList from './TagList';

interface BoxProps {
  boxType: 'Meeting Block' | 'Room Block';
  title: string;
  primaryColor: string;
  time?: string; // For Meeting Block
  tags?: string[]; // For badges like "Hybrid", "AA"
  meetingId: string;
  syncError?: boolean;
  // Admin-only (see hooks/useConflictMids) -- this meeting shares a room/Zoom room/Zoom host
  // with another meeting at an overlapping time. Positioned opposite corner from syncError/
  // zoomTag (both top-right) so all three can coexist without overlapping each other.
  hasConflict?: boolean;
  // Highlights the box (drop shadow) while its View Meeting popup is open.
  selected?: boolean;
  // Stretch to fill the parent's height instead of the fixed Meeting Block height —
  // used by WeeklyView, where the wrapping div's height already encodes the meeting's
  // duration (DailyView instead encodes duration as width, on a fixed-height row).
  fillHeight?: boolean;
  // Tightens padding/font-size/tag sizing so title + time + tags all still fit when
  // fillHeight has shrunk the box well below its normal Meeting Block height — used by
  // DailyView for a meeting sharing its room's row with an overlapping neighbor, where
  // the box is roughly half-height. Without this, tags get clipped off the bottom.
  compact?: boolean;
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
  hasConflict = false,
  fillHeight = false,
  compact = false,
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
      className={`${styles.box} ${boxType === 'Meeting Block' ? styles.meeting : styles.room} ${fillHeight ? styles.fillHeight : ''} ${compact ? styles.compact : ''} ${selected ? styles.selected : ''}`}
      style={{ backgroundColor: bgColor, borderLeft: `6px solid ${primaryColor}`, position: 'relative' }}
      onClick={(e) => onClick(meetingId, e)}
    >
      {syncError && (
        <span title="Sync failed" className={styles.syncError}>
          ⚠
        </span>
      )}
      {hasConflict && (
        <span title="Conflicts with another meeting (see Diagnostics)" className={styles.conflictBadge}>
          ⛔
        </span>
      )}
      {zoomTag && (
        <span ref={zoomTagRef} className={styles.zoomTag} title={`Zoom room: ${zoomTag}`}>
          <img src="/svg/video-call-icon.svg" alt="" className={styles.zoomTagIcon} />
          {zoomTag}
        </span>
      )}
      <h3
        className={styles.title}
        style={{
          ...(titlePaddingRight ? { paddingRight: titlePaddingRight } : undefined),
          // .conflictBadge is a fixed single-glyph icon (unlike zoomTag's variable-width
          // text), so a static reservation is enough -- no ResizeObserver needed.
          ...(hasConflict ? { paddingLeft: 16 } : undefined),
        }}
      >
        {title}
      </h3>

      {boxType === 'Meeting Block' && <p className={styles.time}>{time}</p>}
      {tags && tags.length > 0 && (
        <TagList
          tags={tags}
          color={primaryColor}
          // WeeklyView's tall fillHeight boxes pin tags right under the time line rather
          // than at the bottom (see BoxText.module.scss's .fillHeight comment) -- but not
          // when compact, where it's back to DailyView's half-height stacked case.
          containerStyle={fillHeight && !compact ? { marginTop: 4 } : undefined}
          tagStyle={compact ? { padding: '1px 6px', lineHeight: 1 } : undefined}
        />
      )}
    </div>
  );
};

export default BoxText;
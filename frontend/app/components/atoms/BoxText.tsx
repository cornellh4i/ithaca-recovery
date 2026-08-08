import React, { useLayoutEffect, useRef, useState } from "react";
import styles from '../../../styles/components/atoms/BoxText.module.scss';
import { toPastelColor } from '../../../util/common/color';
import { MODE_ICON_SRC } from '../../../util/modeIcons';
import TagList from './TagList';

interface BoxProps {
  boxType: 'Meeting Block' | 'Room Block';
  title: string;
  primaryColor: string;
  time?: string; // For Meeting Block
  // Mobile's half-height DayColumn rows pass this separately from `time` (rather than
  // pre-concatenated into one string) so the two can wrap independently -- place always
  // renders first, and only the time range itself drops to its own line when the row's
  // too narrow to fit both (see .timeRowWithPlace). Desktop call sites omit this and keep
  // passing a single pre-formatted `time` string, unaffected by this layout.
  location?: string;
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
  // used by WeekView, where the wrapping div's height already encodes the meeting's
  // duration (DayView instead encodes duration as width, on a fixed-height row).
  fillHeight?: boolean;
  // Tightens padding/font-size/tag sizing so title + time + tags all still fit when
  // fillHeight has shrunk the box well below its normal Meeting Block height — used by
  // DayView for a meeting sharing its room's row with an overlapping neighbor, where
  // the box is roughly half-height. Without this, tags get clipped off the bottom.
  //
  // Deprecated: use `tier="compact"` instead. Kept as a working alias (see `tier` below)
  // so existing call sites passing this boolean directly don't need to change.
  compact?: boolean;
  // Extra badge alongside tags, e.g. flagging a Zoom-room mismatch.
  zoomTag?: string;
  // Mobile's half-height DayColumn rows have no room for a full tag row -- drops it
  // entirely and prefixes the title with a small mode icon instead (see MODE_ICON_SRC),
  // so the one piece of tag info that mattered most for a glance (how to attend) survives.
  hideTags?: boolean;
  // Explicit density tier. Defaults to "full" (today's non-compact layout, unchanged).
  // "compact" is the same half-height treatment the `compact` boolean above already gives
  // (tags dropped, room/title kept) -- this is just the named form of it. "subcompact" drops
  // further to title + mode icon only, one line, no room/time/tags at all -- used solely by
  // DayLandscapeView's subcompact-row grid (12 rooms stacked on a landscape phone), where
  // there's no vertical room for anything else. `hideTags`'s mode-icon-in-title treatment
  // applies at this tier automatically, regardless of whether `hideTags` itself was passed.
  tier?: 'full' | 'compact' | 'subcompact';
  onClick: (meetingId: string, e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  [key: string]: unknown;
};

const BoxText: React.FC<BoxProps> = ({
  boxType,
  title,
  primaryColor,
  time,
  location,
  tags,
  meetingId,
  syncError = false,
  hasConflict = false,
  fillHeight = false,
  compact = false,
  zoomTag,
  hideTags = false,
  tier,
  selected = false,
  onClick
}) => {
  const resolvedTier = tier ?? (compact ? 'compact' : 'full');
  const isCompact = resolvedTier === 'compact';
  const isSubcompact = resolvedTier === 'subcompact';
  // Subcompact always gets the hideTags treatment (mode icon in the title, no tag row, no
  // time/location line below) whether or not hideTags itself was passed -- there's no
  // "subcompact but show tags" case.
  const iconInTitle = hideTags || isSubcompact;

  const bgColor =
    boxType === 'Meeting Block'
      ? toPastelColor(primaryColor)
      : primaryColor;
  // Subcompact's row is too short for the standard 6px accent to read proportionally.
  const borderLeftWidth = isSubcompact ? 3 : 6;

  const modeTag = tags?.find(tag => MODE_ICON_SRC[tag]);
  const modeIconSrc = modeTag ? MODE_ICON_SRC[modeTag] : undefined;

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
      className={`${styles.box} ${boxType === 'Meeting Block' ? styles.meeting : styles.room} ${fillHeight ? styles.fillHeight : ''} ${isCompact ? styles.compact : ''} ${isSubcompact ? styles.tierSubcompact : ''} ${selected ? styles.selected : ''}`}
      style={{ backgroundColor: bgColor, borderLeft: `${borderLeftWidth}px solid ${primaryColor}`, position: 'relative' }}
      onClick={(e) => onClick(meetingId, e)}
    >
      {syncError && (
        <span role="img" aria-label="Sync failed" title="Sync failed" className={styles.syncError}>
          <img src="/svg/sync-error-icon.svg" alt="" />
        </span>
      )}
      {hasConflict && (
        <span
          role="img"
          aria-label="Conflicts with another meeting (see Diagnostics)"
          title="Conflicts with another meeting (see Diagnostics)"
          className={styles.conflictBadge}
        >
          <img src="/svg/warning-icon.svg" alt="" />
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
        {iconInTitle && modeIconSrc && (
          <span role="img" aria-label={modeTag} title={modeTag} className={styles.modeIcon}>
            <img src={modeIconSrc} alt="" />
          </span>
        )}
        {title}
      </h3>

      {boxType === 'Meeting Block' && !isSubcompact && (
        location !== undefined ? (
          <p className={`${styles.time} ${styles.timeRowWithPlace}`}>
            {location && <span className={styles.place}>{location} ·</span>}
            <span className={styles.timeRange}>{time}</span>
          </p>
        ) : (
          <p className={styles.time}>{time}</p>
        )
      )}
      {!iconInTitle && tags && tags.length > 0 && (
        <TagList
          tags={tags}
          color={primaryColor}
          // WeekView's tall fillHeight boxes pin tags right under the time line rather
          // than at the bottom (see BoxText.module.scss's .fillHeight comment) -- but not
          // when compact, where it's back to DayView's half-height stacked case.
          containerStyle={fillHeight && !isCompact ? { marginTop: 4 } : undefined}
          tagStyle={isCompact ? { padding: '1px 6px', lineHeight: 1 } : undefined}
        />
      )}
    </div>
  );
};

export default BoxText;
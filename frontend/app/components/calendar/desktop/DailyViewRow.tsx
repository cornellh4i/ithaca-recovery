import React, { useState, useRef, useEffect } from 'react';
import BoxText from '../../atoms/BoxText';
import OverlapMeetingsModal from '../shared/OverlapMeetingsModal';
import styles from '../../../../styles/components/calendar/desktop/DailyViewRow.module.scss';
import { formatCompactTimeRange } from '../../../../util/timeFormat';
import { formatETDateString } from '../../../../util/timeUtils';

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
  positionIndex?: number; // Lane index among overlapping meetings in this room, assigned by layoutOverlappingMeetings
  totalOverlapping?: number; // Lane count among overlapping meetings in this room
  isOverflowIndicator?: boolean; // "+N more" pseudo-entry standing in for meetings past the 2 shown lanes
  overflowCount?: number;
  overflowMeetings?: Meeting[]; // Full overlapping cluster (shown + folded), for the "+N" popup
  clusterRange?: { start: string; end: string; key: string }; // Full cluster time range, shared by every member -- see meetingOverlapLayout.ts
}

// DailyViewRowProps Interface
interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  // The date of the currently-selected occurrence -- when set, only this row's own boxes whose
  // date matches get to render as "selected" (see DayColumn's identical prop for why).
  selectedOccurrenceDate?: Date | null;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
  // The calendar date this row represents -- recorded on every box click so a recurring
  // meeting's "effective date" reflects the specific occurrence clicked, not whichever date
  // the calendar happens to be globally centered on (see setLastClickedDate).
  columnDate: Date;
  setLastClickedDate?: (date: Date) => void;
  // Admin-only (see hooks/useConflictMids) -- mids with an unresolved conflict.
  conflictMids?: Set<string>;
  // Landscape-mode overrides, all optional -- DayLandscapeView passes every one of these
  // together to run a much smaller, dynamically-sized subcompact grid; no other caller sets
  // any of them, so the defaults below reproduce desktop DayView's fixed 155px-hour /
  // 105px-row scale exactly.
  hourWidth?: number;
  rowHeight?: number;
  // Shifts timeToPixels' origin -- e.g. 7 for a 7:00-21:00 grid instead of the desktop
  // default's full 0:00-24:00 day.
  startHour?: number;
  // Passed straight to BoxText. DayLandscapeView's subcompact rows have no room for the
  // "pop out to full height on select" treatment below (isSelected reverting fillHeight) --
  // uniformHeight makes every card, selected or not, always fill its row.
  tier?: 'full' | 'compact' | 'subcompact';
  uniformHeight?: boolean;
}

const DEFAULT_HOUR_WIDTH = 155;
// BoxText's fixed Meeting Block height (BoxText.module.scss `.meeting`). When 2 meetings
// share this room's row at once, each gets half of it, minus a small gap between them.
const DEFAULT_ROW_HEIGHT = 105;
const LANE_GAP = 5;

const DailyViewRow: React.FC<DailyViewRowProps> = ({
  roomColor,
  meetings,
  selectedMeetingID,
  setSelectedMeetingID,
  selectedOccurrenceDate,
  setSelectedNewMeeting,
  setAnchorEl,
  columnDate,
  setLastClickedDate,
  conflictMids,
  hourWidth = DEFAULT_HOUR_WIDTH,
  rowHeight = DEFAULT_ROW_HEIGHT,
  startHour = 0,
  tier,
  uniformHeight = false,
}) => {
  // 1 hour is `hourWidth`px wide, offset so `startHour` sits at x:0.
  const timeToPixels = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours - startHour) * hourWidth + minutes * (hourWidth / 60);
  };
  const MEETING_SLOT_HEIGHT = rowHeight;
  const LANE_HEIGHT = (MEETING_SLOT_HEIGHT - LANE_GAP) / 2;
  const [overlapModalMeetings, setOverlapModalMeetings] = useState<Meeting[] | null>(null);
  // The "+N" pill that opened the modal -- kept as a fallback popup anchor, since the
  // modal's own row is unmounted the instant it closes and getBoundingClientRect() on a
  // detached node would anchor the popup nowhere useful. Superseded by the selected
  // meeting's own card (see selectedCardRef below) once that card renders, since the pill
  // sits in a fixed corner of the row and can be far from where the card actually is.
  const [overlapAnchorEl, setOverlapAnchorEl] = useState<HTMLElement | null>(null);

  // DOM node of whichever card currently has isSelected===true (normal or promoted).
  // Selecting a meeting from the overflow modal re-anchors ViewMeeting to this once it
  // mounts/updates, since the modal-open pill is a poor stand-in for the card's position.
  const selectedCardRef = useRef<HTMLDivElement | null>(null);
  // Set right before a modal-driven selection, so the effect below knows to re-anchor.
  const pendingModalAnchorRef = useRef(false);

  const handleBoxClick = (meetingId: string, el: HTMLElement) => {
    console.log(`Meeting ${meetingId} clicked`);
    setSelectedMeetingID(meetingId);
    setSelectedNewMeeting(false);
    setAnchorEl(el);
    setLastClickedDate?.(columnDate);
  };

  useEffect(() => {
    if (pendingModalAnchorRef.current && selectedCardRef.current) {
      setAnchorEl(selectedCardRef.current);
      pendingModalAnchorRef.current = false;
    }
  }, [selectedMeetingID, setAnchorEl]);

  // Undefined selectedOccurrenceDate (no click has happened yet, e.g. a deep link) falls back
  // to matching on id alone, same as before this row-scoping existed.
  const isOccurrenceDateMatch = !selectedOccurrenceDate || formatETDateString(columnDate) === formatETDateString(selectedOccurrenceDate);

  // Renders a single meeting's card. `forceSelected` is used to promote a folded
  // "+N" meeting (picked via the overflow modal) onto the stack even though it has
  // no lane of its own -- same full-row/shadow treatment as selecting one of the two
  // already-shown stacked meetings.
  const renderMeetingCard = (meeting: Meeting, key: React.Key, forceSelected = false) => {
    const startOffset = timeToPixels(meeting.startTime);
    const endOffset = timeToPixels(meeting.endTime);
    const width = endOffset - startOffset;

    // Compact ET display (e.g. "9-10AM", "9-9:30AM", "11AM-12:30PM") — uses the true,
    // unclipped time so a split overnight meeting still labels the same on both halves.
    const compactTime = formatCompactTimeRange(
      meeting.displayStartTime ?? meeting.startTime,
      meeting.displayEndTime ?? meeting.endTime,
    );

    // Selecting a meeting brings it above any other overlapping meeting in this row --
    // otherwise stacking just follows DOM/array order, so the clicked one could render
    // underneath a later-starting neighbor it visually overlaps. Reverts on its own once
    // deselected, since this is just a render-time override, not stored state.
    const isSelected = forceSelected || (meeting.id === selectedMeetingID && isOccurrenceDateMatch);

    // A single meeting fills the room's row exactly; overlapping meetings split it into
    // top/bottom lanes instead (time already reads along the horizontal axis here, so
    // overlap splits vertically -- the rotated equivalent of WeekView's side-by-side
    // columns, where time reads vertically and overlap splits horizontally).
    const isStacked = !!meeting.totalOverlapping && meeting.totalOverlapping > 1;
    const laneTop = isStacked ? (meeting.positionIndex ?? 0) * (LANE_HEIGHT + LANE_GAP) : undefined;

    return (
      <div
        key={key}
        ref={isSelected ? selectedCardRef : undefined}
        className={styles.meetingWrapper}
        style={{
          left: `${startOffset}px`,
          width: `${width}px`,
          // uniformHeight needs an explicit top+height here, not just BoxText's own
          // fillHeight -- .meetingWrapper is position: absolute with no top/bottom set
          // otherwise, so BoxText's height: 100% (fillHeight's CSS) had nothing concrete to
          // resolve against and fell back to its own content height, leaving a gap below
          // every card instead of filling the row.
          top: uniformHeight ? 0 : (isSelected ? 0 : laneTop),
          height: uniformHeight
            ? `${rowHeight}px`
            : (isSelected ? undefined : (isStacked ? `${LANE_HEIGHT}px` : undefined)),
          // Above the "+N" overflow pill's z-index (12, DailyViewRow.module.scss) too,
          // so a selected meeting is unambiguously the topmost thing in the row.
          zIndex: isSelected ? 13 : undefined,
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
          hasConflict={conflictMids?.has(meeting.id)}
          selected={isSelected}
          fillHeight={uniformHeight || (isStacked && !isSelected)}
          tier={tier ?? (isStacked && !isSelected ? 'compact' : undefined)}
          onClick={(meetingId, e) => {
            handleBoxClick(meetingId, e.currentTarget);
            e.stopPropagation();
          }}
        />
      </div>
    );
  };

  // If the selected meeting was picked from an overflow "+N" popup rather than one
  // of the two normally-rendered stacked cards, it has no lane of its own -- find it
  // in the folded cluster so it can be promoted onto the stack (see renderMeetingCard).
  const renderedIds = new Set(meetings.filter(m => !m.isOverflowIndicator).map(m => m.id));
  const promotedMeeting = selectedMeetingID && isOccurrenceDateMatch && !renderedIds.has(selectedMeetingID)
    ? meetings.flatMap(m => m.overflowMeetings ?? []).find(m => m.id === selectedMeetingID)
    : undefined;

  // One background container per overlapping cluster, deduped by clusterRange.key --
  // several meetings (and an overflow indicator) can share the same cluster.
  const clusterRanges = new Map<string, { start: string; end: string }>();
  meetings.forEach(meeting => {
    if (meeting.clusterRange && !clusterRanges.has(meeting.clusterRange.key)) {
      clusterRanges.set(meeting.clusterRange.key, meeting.clusterRange);
    }
  });

  return (
    <div style={{ cursor: "pointer", position: 'relative', width: '100%', height: '100%' }}>
      <div>
        {/* Render 24-hour blocks */}
        {Array.from({ length: 24 }).map((_, colIndex) => (
          <div key={colIndex}></div>
        ))}

        {/* Cluster containers -- rendered beneath the meeting cards and "+N" pill (see
            z-index in DailyViewRow.module.scss), spanning each cluster's full time range so
            it reads as one connected group, like a single meeting spanning the whole cluster. */}
        {Array.from(clusterRanges.entries()).map(([key, range]) => {
          const startOffset = timeToPixels(range.start);
          const endOffset = timeToPixels(range.end);
          return (
            <div
              key={key}
              className={styles.clusterContainer}
              // Explicit pixel height, not the CSS class's percentage -- .gridMeetingRow
              // (an ancestor) is itself position:absolute with no explicit height, which
              // breaks the percentage-height resolution chain for an empty div.
              style={{ left: `${startOffset}px`, width: `${endOffset - startOffset}px`, height: `${MEETING_SLOT_HEIGHT}px` }}
            />
          );
        })}

        {/* Render meetings */}
        {meetings.map((meeting, index) => {
          if (meeting.isOverflowIndicator) {
            // Anchored to the cluster's end time so the pill sits at the top-right of its
            // time slot instead of top-left, where it would sit directly over the start of
            // the meeting cards it stands in for (title/time text starts from the left edge).
            const endOffset = timeToPixels(meeting.endTime);
            return (
              <div
                key={index}
                role="button"
                tabIndex={0}
                aria-label={`${meeting.overflowCount} more meetings at this time`}
                className={styles.overflowIndicator}
                style={{ left: `${endOffset}px`, transform: 'translateX(-100%)' }}
                title={`${meeting.overflowCount} more meeting${meeting.overflowCount === 1 ? '' : 's'} at this time — click to see all meetings`}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent row click handler from firing
                  setOverlapModalMeetings(
                    (meeting.overflowMeetings ?? []).map(m => ({ ...m, primaryColor: roomColor }))
                  );
                  setOverlapAnchorEl(e.currentTarget);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    setOverlapModalMeetings(
                      (meeting.overflowMeetings ?? []).map(m => ({ ...m, primaryColor: roomColor }))
                    );
                    setOverlapAnchorEl(e.currentTarget);
                  }
                }}
              >
                +{meeting.overflowCount}
              </div>
            );
          }

          return renderMeetingCard(meeting, index);
        })}

        {promotedMeeting && renderMeetingCard(promotedMeeting, `promoted-${promotedMeeting.id}`, true)}
      </div>

      <OverlapMeetingsModal
        isOpen={overlapModalMeetings !== null}
        meetings={overlapModalMeetings ?? []}
        conflictMids={conflictMids}
        onClose={() => setOverlapModalMeetings(null)}
        onSelectMeeting={(meetingId) => {
          pendingModalAnchorRef.current = true;
          if (overlapAnchorEl) handleBoxClick(meetingId, overlapAnchorEl);
          setOverlapModalMeetings(null);
        }}
      />
    </div>
  );
};

export default DailyViewRow;

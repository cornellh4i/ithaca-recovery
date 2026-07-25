import React, { useState } from 'react';
import BoxText from '../atoms/BoxText';
import OverlapMeetingsModal from './OverlapMeetingsModal';
import styles from '../../../styles/components/molecules/DailyViewRow.module.scss';
import { formatCompactTimeRange } from '../../../util/timeFormat';

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
}

// DailyViewRowProps Interface
interface DailyViewRowProps {
  roomColor: string;
  meetings: Meeting[];
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
}

// 1 hour is 155px in width (155/60 px per minute), matching the 155px-wide hour columns.
const timeToPixels = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 155 + minutes * (155 / 60);
};

// BoxText's fixed Meeting Block height (BoxText.module.scss `.meeting`). When 2 meetings
// share this room's row at once, each gets half of it, minus a small gap between them.
const MEETING_SLOT_HEIGHT = 105;
const LANE_GAP = 5;
const LANE_HEIGHT = (MEETING_SLOT_HEIGHT - LANE_GAP) / 2;

const DailyViewRow: React.FC<DailyViewRowProps> = ({
  roomColor,
  meetings,
  selectedMeetingID,
  setSelectedMeetingID,
  setSelectedNewMeeting,
  setAnchorEl,
}) => {
  const [overlapModalMeetings, setOverlapModalMeetings] = useState<Meeting[] | null>(null);
  // The "+N" pill that opened the modal -- kept as the popup anchor for whichever meeting
  // gets selected from it, since the modal's own row is unmounted the instant it closes and
  // getBoundingClientRect() on a detached node would anchor the popup nowhere useful.
  const [overlapAnchorEl, setOverlapAnchorEl] = useState<HTMLElement | null>(null);

  const handleBoxClick = (meetingId: string, el: HTMLElement) => {
    console.log(`Meeting ${meetingId} clicked`);
    setSelectedMeetingID(meetingId);
    setSelectedNewMeeting(false);
    setAnchorEl(el);
  };

  return (
    <div style={{ cursor: "pointer", position: 'relative', width: '100%', height: '100%' }}>
      <div>
        {/* Render 24-hour blocks */}
        {Array.from({ length: 24 }).map((_, colIndex) => (
          <div key={colIndex}></div>
        ))}

        {/* Render meetings */}
        {meetings.map((meeting, index) => {
          // Convert times to EDT before calculating pixels
          const startOffset = timeToPixels(meeting.startTime);
          const endOffset = timeToPixels(meeting.endTime);
          const width = endOffset - startOffset;

          if (meeting.isOverflowIndicator) {
            return (
              <div
                key={index}
                className={styles.overflowIndicator}
                style={{ left: `${startOffset}px` }}
                title={`${meeting.overflowCount} more meeting${meeting.overflowCount === 1 ? '' : 's'} at this time — click to see all meetings`}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent row click handler from firing
                  setOverlapModalMeetings(
                    (meeting.overflowMeetings ?? []).map(m => ({ ...m, primaryColor: roomColor }))
                  );
                  setOverlapAnchorEl(e.currentTarget);
                }}
              >
                +{meeting.overflowCount}
              </div>
            );
          }

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
          const isSelected = meeting.id === selectedMeetingID;

          // A single meeting fills the room's row exactly; overlapping meetings split it into
          // top/bottom lanes instead (time already reads along the horizontal axis here, so
          // overlap splits vertically -- the rotated equivalent of WeeklyView's side-by-side
          // columns, where time reads vertically and overlap splits horizontally).
          const isStacked = !!meeting.totalOverlapping && meeting.totalOverlapping > 1;
          const laneTop = isStacked ? (meeting.positionIndex ?? 0) * (LANE_HEIGHT + LANE_GAP) : undefined;

          return (
            <div
              key={index}
              className={styles.meetingWrapper}
              style={{
                left: `${startOffset}px`,
                width: `${width}px`,
                top: isSelected ? 0 : laneTop,
                height: isSelected ? undefined : (isStacked ? `${LANE_HEIGHT}px` : undefined),
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
                selected={isSelected}
                fillHeight={isStacked && !isSelected}
                compact={isStacked && !isSelected}
                onClick={(meetingId, e) => {
                  handleBoxClick(meetingId, e.currentTarget);
                  e.stopPropagation();
                }}
              />
            </div>
          );
        })}
      </div>

      <OverlapMeetingsModal
        isOpen={overlapModalMeetings !== null}
        meetings={overlapModalMeetings ?? []}
        onClose={() => setOverlapModalMeetings(null)}
        onSelectMeeting={(meetingId) => {
          if (overlapAnchorEl) handleBoxClick(meetingId, overlapAnchorEl);
          setOverlapModalMeetings(null);
        }}
      />
    </div>
  );
};

export default DailyViewRow;

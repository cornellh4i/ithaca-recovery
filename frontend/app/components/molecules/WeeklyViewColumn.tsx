import React, { useState, useRef, useEffect } from 'react';
import BoxText from '../atoms/BoxText';
import OverlapMeetingsModal from './OverlapMeetingsModal';
import styles from '../../../styles/components/molecules/WeeklyViewColumn.module.scss';
import { isZoomRoomMismatched } from '../../../util/rooms';
import { formatCompactTimeRange } from '../../../util/timeFormat';

interface Meeting {
    id: string;
    title: string;
    startTime: string; // clipped to this day, for layout/positioning
    endTime: string; // clipped to this day, for layout/positioning
    displayStartTime?: string; // true time, for the label
    displayEndTime?: string; // true time, for the label
    tags?: string[];
    room?: string; // Added room property
    zoomRoom?: string | null;
    primaryColor?: string; // Added to support different colored meetings
    positionIndex?: number; // For handling overlapping meetings
    totalOverlapping?: number; // For handling overlapping meetings
    isOverflowIndicator?: boolean; // "+N more" pseudo-entry, rendered as a small pill instead of a meeting card
    overflowCount?: number;
    overflowMeetings?: Meeting[]; // Full overlapping cluster, shown in the "+N" popup
}

// Drops the " - Zoom" suffix for a more compact badge label
const formatZoomRoomLabel = (zoomRoom: string) => zoomRoom.replace(/ - Zoom$/, '');

interface WeeklyViewColumnProps {
    roomColor: string;
    meetings: Meeting[];
    selectedMeetingID: string | null;
    setSelectedMeetingID: (meetingId: string) => void;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
    setAnchorEl: (el: HTMLElement) => void;
}

// 1 hour is 120px in height (120/60 px per minute), matching .timeSlot's 120px row height
const timeToPixels = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 120 + minutes * (120 / 60);
};

// Visual breathing room between two back-to-back meetings that would otherwise share
// a hard edge (one ending exactly when the next starts) -- split evenly off each card's
// top/bottom so the gap is centered on the boundary between them.
const VERTICAL_GAP = 6;

const WeeklyViewColumn: React.FC<WeeklyViewColumnProps> = ({
    roomColor,
    meetings,
    selectedMeetingID,
    setSelectedMeetingID,
    setSelectedNewMeeting,
    setAnchorEl,
}) => {
    const [overlapModalMeetings, setOverlapModalMeetings] = useState<Meeting[] | null>(null);
    // The "+N" pill that opened the modal -- kept as a fallback popup anchor, since the
    // modal's own row is unmounted the instant it closes and getBoundingClientRect() on a
    // detached node would anchor the popup nowhere useful. Superseded by the selected
    // meeting's own card (see selectedCardRef below) once that card renders, since the pill
    // sits in a fixed corner of the column and can be far from where the card actually is.
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
    };

    useEffect(() => {
        if (pendingModalAnchorRef.current && selectedCardRef.current) {
            setAnchorEl(selectedCardRef.current);
            pendingModalAnchorRef.current = false;
        }
    }, [selectedMeetingID, setAnchorEl]);

    // Renders a single meeting's card. `forceSelected` is used to promote a folded
    // "+N" meeting (picked via the overflow modal) onto the stack even though it has
    // no normal slot of its own -- same full-width/shadow treatment as selecting one
    // of the two already-shown stacked meetings.
    const renderMeetingCard = (meeting: Meeting, key: React.Key, forceSelected = false) => {
        // Remote-only meetings have no physical room, so fall back to the
        // Zoom room — otherwise the location line would be blank.
        const locationLabel = meeting.room || meeting.zoomRoom || '';
        const topOffset = timeToPixels(meeting.startTime) + VERTICAL_GAP / 2;
        const height = Math.max(
            timeToPixels(meeting.endTime) - timeToPixels(meeting.startTime) - VERTICAL_GAP,
            1,
        );

        // A single meeting fills the column exactly; overlapping meetings split it evenly
        let width = '100%';
        let left = '0%';

        if (meeting.totalOverlapping && meeting.totalOverlapping > 1) {
            const singleWidth = 100 / meeting.totalOverlapping;
            width = `${singleWidth}%`;
            left = `${(meeting.positionIndex || 0) * singleWidth}%`;
        }

        // Selecting a meeting that's sharing space in an overlapping cluster brings
        // it fully into view (and above its siblings) instead of leaving it in its
        // narrow shared column -- reverts on its own once deselected, since this is
        // just a render-time override, not stored state.
        const isSelected = forceSelected || meeting.id === selectedMeetingID;

        return (
            <div
                key={key}
                ref={isSelected ? selectedCardRef : undefined}
                className={styles.meetingWrapper}
                style={{
                    top: `${topOffset}px`,
                    height: `${height}px`,
                    width: isSelected ? '100%' : width,
                    left: isSelected ? '0%' : left,
                    // Above the "+N" overflow pill's z-index (12, WeeklyViewColumn.module.scss)
                    // too, so a selected meeting is unambiguously the topmost thing in the column.
                    zIndex: isSelected ? 13 : undefined,
                }}
                onClick={(e) => e.stopPropagation()} // Prevent column click handler from firing
            >
                <BoxText
                    boxType="Meeting Block"
                    title={meeting.title}
                    primaryColor={meeting.primaryColor || roomColor}
                    time={`${locationLabel ? `${locationLabel} · ` : ''}${formatCompactTimeRange(meeting.displayStartTime ?? meeting.startTime, meeting.displayEndTime ?? meeting.endTime)}`}
                    tags={meeting.tags}
                    meetingId={meeting.id}
                    zoomTag={
                        meeting.room && isZoomRoomMismatched(meeting.room, meeting.zoomRoom)
                            ? formatZoomRoomLabel(meeting.zoomRoom!)
                            : undefined
                    }
                    fillHeight
                    selected={isSelected}
                    onClick={(meetingId, e) => {
                        handleBoxClick(meetingId, e.currentTarget);
                        e.stopPropagation(); // Prevent column click handler from firing
                    }}
                />
            </div>
        );
    };

    // If the selected meeting was picked from an overflow "+N" popup rather than one
    // of the two normally-rendered stacked cards, it has no slot of its own -- find it
    // in the folded cluster so it can be promoted onto the stack (see renderMeetingCard).
    const renderedIds = new Set(meetings.filter(m => !m.isOverflowIndicator).map(m => m.id));
    const promotedMeeting = selectedMeetingID && !renderedIds.has(selectedMeetingID)
        ? meetings.flatMap(m => m.overflowMeetings ?? []).find(m => m.id === selectedMeetingID)
        : undefined;

    return (
        <div className={styles.columnWrapper}>
            <div className={styles.columnBody}>
                {/* Render hour markers */}
                {Array.from({ length: 24 }).map((_, hourIndex) => (
                    <div
                        key={hourIndex}
                        className={styles.hourMarker}
                        style={{ top: `${hourIndex * 120}px` }}
                    />
                ))}

                {meetings.map((meeting, index) => {
                    if (meeting.isOverflowIndicator) {
                        const topOffset = timeToPixels(meeting.startTime);
                        return (
                            <div
                                key={index}
                                role="button"
                                tabIndex={0}
                                aria-label={`${meeting.overflowCount} more meetings at this time`}
                                className={styles.overflowIndicator}
                                style={{ top: `${topOffset}px` }}
                                title={`${meeting.overflowCount} more meeting${meeting.overflowCount === 1 ? '' : 's'} at this time — click to see all meetings`}
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent column click handler from firing
                                    setOverlapModalMeetings(meeting.overflowMeetings ?? []);
                                    setOverlapAnchorEl(e.currentTarget);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setOverlapModalMeetings(meeting.overflowMeetings ?? []);
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

export default WeeklyViewColumn;
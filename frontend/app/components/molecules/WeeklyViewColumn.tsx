import React, { useState } from 'react';
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
    setSelectedMeetingID: (meetingId: string) => void;
    setSelectedNewMeeting: (newMeetingExists: boolean) => void;
}

// 1 hour is 100px in height (100/60 px per minute), matching .timeSlot's 100px row height
const timeToPixels = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 100 + minutes * (100 / 60);
};

const WeeklyViewColumn: React.FC<WeeklyViewColumnProps> = ({
    roomColor,
    meetings,
    setSelectedMeetingID,
    setSelectedNewMeeting,
}) => {
    const [overlapModalMeetings, setOverlapModalMeetings] = useState<Meeting[] | null>(null);

    const handleBoxClick = (meetingId: string) => {
        console.log(`Meeting ${meetingId} clicked`);
        setSelectedMeetingID(meetingId);
        setSelectedNewMeeting(false);
    };

    return (
        <div className={styles.columnWrapper}>
            <div className={styles.columnBody}>
                {/* Render hour markers */}
                {Array.from({ length: 24 }).map((_, hourIndex) => (
                    <div
                        key={hourIndex}
                        className={styles.hourMarker}
                        style={{ top: `${hourIndex * 100}px` }}
                    />
                ))}

                {meetings.map((meeting, index) => {
                    // Remote-only meetings have no physical room, so fall back to the
                    // Zoom room — otherwise the location line would be blank.
                    const locationLabel = meeting.room || meeting.zoomRoom || '';
                    const topOffset = timeToPixels(meeting.startTime);

                    if (meeting.isOverflowIndicator) {
                        return (
                            <div
                                key={index}
                                className={styles.overflowIndicator}
                                style={{ top: `${topOffset}px` }}
                                title={`${meeting.overflowCount} more meeting${meeting.overflowCount === 1 ? '' : 's'} at this time — click to see all meetings`}
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent column click handler from firing
                                    setOverlapModalMeetings(meeting.overflowMeetings ?? []);
                                }}
                            >
                                +{meeting.overflowCount}
                            </div>
                        );
                    }

                    const bottomOffset = timeToPixels(meeting.endTime);
                    const height = bottomOffset - topOffset;

                    // A single meeting fills the column exactly; overlapping meetings split it evenly
                    let width = '100%';
                    let left = '0%';

                    if (meeting.totalOverlapping && meeting.totalOverlapping > 1) {
                        const singleWidth = 100 / meeting.totalOverlapping;
                        width = `${singleWidth}%`;
                        left = `${(meeting.positionIndex || 0) * singleWidth}%`;
                    }

                    return (
                        <div
                            key={index}
                            className={styles.meetingWrapper}
                            style={{ top: `${topOffset}px`, height: `${height}px`, width, left }}
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
                                onClick={(meetingId, e) => {
                                    handleBoxClick(meetingId);
                                    e.stopPropagation(); // Prevent column click handler from firing
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
                    handleBoxClick(meetingId);
                    setOverlapModalMeetings(null);
                }}
            />
        </div>
    );
};

export default WeeklyViewColumn;
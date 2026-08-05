import React from 'react';
import { createPortal } from 'react-dom';
import styles from '../../../styles/components/calendar/OverlapMeetingsModal.module.scss';
import { formatCompactTimeRange } from '../../../util/timeFormat';
import { toPastelColor } from '../../../util/color';
import TagList from '../atoms/TagList';

interface OverlapMeeting {
    id: string;
    title: string;
    startTime: string; // "HH:MM" 24hr ET, clipped to this day
    endTime: string; // "HH:MM" 24hr ET, clipped to this day
    displayStartTime?: string; // true time, for the label
    displayEndTime?: string; // true time, for the label
    room?: string;
    zoomRoom?: string | null;
    tags?: string[];
    primaryColor?: string;
    syncError?: boolean;
}

interface OverlapMeetingsModalProps {
    isOpen: boolean;
    meetings: OverlapMeeting[];
    // Admin-only (see hooks/useConflictMids) -- mids with an unresolved conflict. Same source
    // BoxText's corner badge reads from; kept as the live Set (not baked into each meeting at
    // click time) so a conflict that appears/resolves while the modal is open stays accurate.
    conflictMids?: Set<string>;
    onClose: () => void;
    onSelectMeeting: (meetingId: string) => void;
}

const OverlapMeetingsModal: React.FC<OverlapMeetingsModalProps> = ({
    isOpen,
    meetings,
    conflictMids,
    onClose,
    onSelectMeeting,
}) => {
    if (!isOpen) return null;

    // Full range across every meeting shown (true, unclipped times where available) --
    // e.g. "9 - 11 AM" for meetings spanning 9-10, 9:30-10:30, and 10-11.
    const timeRangeLabel = meetings.reduce<{ start: string; end: string } | null>((range, meeting) => {
        const start = meeting.displayStartTime ?? meeting.startTime;
        const end = meeting.displayEndTime ?? meeting.endTime;
        if (!range) return { start, end };
        return {
            start: start < range.start ? start : range.start,
            end: end > range.end ? end : range.end,
        };
    }, null);

    // Portaled to document.body -- both Day and Week view render this from deep inside
    // absolutely-positioned, z-indexed ancestors (e.g. DayView's .gridMeetingRow), each
    // of which forms its own stacking context. Left in place, this modal's z-index would
    // only be compared *within* that ancestor's context, so a sibling with a higher
    // z-index at the parent level (e.g. the sticky room-label column) would still paint
    // over it despite `position: fixed` and z-index: 1000 here.
    return createPortal(
        <div className={styles.modalOverlay} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalContent}>
                <div className={styles.header}>
                    <h2 className={styles.modalTitle}>
                        {meetings.length} Meeting{meetings.length === 1 ? '' : 's'}
                        {timeRangeLabel && ` (${formatCompactTimeRange(timeRangeLabel.start, timeRangeLabel.end)})`}
                    </h2>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>

                <div className={styles.list}>
                    {meetings.map(meeting => {
                        const locationLabel = meeting.room || meeting.zoomRoom || '';
                        const hasConflict = conflictMids?.has(meeting.id);
                        return (
                            <div
                                key={meeting.id}
                                className={styles.meetingItem}
                                style={{
                                    borderLeftColor: meeting.primaryColor,
                                    backgroundColor: meeting.primaryColor ? toPastelColor(meeting.primaryColor) : undefined,
                                }}
                                onClick={() => onSelectMeeting(meeting.id)}
                            >
                                {meeting.syncError && (
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
                                <h3 className={styles.title} style={hasConflict ? { paddingLeft: 16 } : undefined}>
                                    {meeting.title}
                                </h3>
                                {locationLabel && (
                                    <div className={styles.location}>
                                        <span className={styles.dot} style={{ backgroundColor: meeting.primaryColor }} />
                                        {locationLabel}
                                    </div>
                                )}
                                <p className={styles.time}>
                                    {formatCompactTimeRange(meeting.displayStartTime ?? meeting.startTime, meeting.displayEndTime ?? meeting.endTime)}
                                </p>
                                {meeting.tags && meeting.tags.length > 0 && (
                                    <TagList
                                        tags={meeting.tags}
                                        color={meeting.primaryColor ?? '#999'}
                                        gap={4}
                                        tagStyle={{ padding: '2px 12px', color: '#1E1E1E' }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default OverlapMeetingsModal;

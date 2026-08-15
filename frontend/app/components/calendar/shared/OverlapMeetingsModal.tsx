import React from 'react';
import styles from './OverlapMeetingsModal.module.scss';
import { formatCompactTimeRange } from '../../../../util/date/timeFormat';
import { toPastelColor } from '../../../../util/common/color';
import Icon from '../../ui/displays/Icon';
import TagList from '../../ui/displays/TagList';
import Modal from '../../ui/overlays/Modal';

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
}

interface OverlapMeetingsModalProps {
    isOpen: boolean;
    meetings: OverlapMeeting[];
    // Admin-only (see hooks/useConflictMids) -- mids with an unresolved conflict. Same source
    // BoxText's corner badge reads from; kept as the live Set (not baked into each meeting at
    // click time) so a conflict that appears/resolves while the modal is open stays accurate.
    conflictMids?: Set<string>;
    // Admin-only (see hooks/useSyncErrorMids) -- mids with a Google Calendar/Zoom sync error.
    // Same live-Set treatment as conflictMids above.
    syncErrorMids?: Set<string>;
    onClose: () => void;
    onSelectMeeting: (meetingId: string) => void;
}

const OverlapMeetingsModal: React.FC<OverlapMeetingsModalProps> = ({
    isOpen,
    meetings,
    conflictMids,
    syncErrorMids,
    onClose,
    onSelectMeeting,
}) => {
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

    return (
        // Both Day and Week view render this from deep inside absolutely-positioned, z-indexed
        // ancestors (e.g. DayView's .gridMeetingRow) that are also each their own clickable cell
        // -- Modal itself portals to document.body (see its own doc comment for why), which
        // sidesteps the z-index-only-compared-within-ancestor-context problem this used to note,
        // but a click anywhere in here still bubbles through the *React* tree (not the DOM tree)
        // up to that cell's own click-to-create-a-meeting handler unless stopped here.
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            overlayClassName={styles.modalOverlay}
            labelledBy="overlap-meetings-title"
        >
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 id="overlap-meetings-title" className={styles.modalTitle}>
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
                        const hasSyncError = syncErrorMids?.has(meeting.id);
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
                                {hasSyncError && (
                                    <span role="img" aria-label="Sync failed" title="Sync failed" className={styles.syncError}>
                                        <Icon name="sync-error" />
                                    </span>
                                )}
                                {hasConflict && (
                                    <span
                                        role="img"
                                        aria-label="Conflicts with another meeting (see Diagnostics)"
                                        title="Conflicts with another meeting (see Diagnostics)"
                                        className={styles.conflictBadge}
                                    >
                                        <Icon name="warning" />
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
        </Modal>
    );
};

export default OverlapMeetingsModal;

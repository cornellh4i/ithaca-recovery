import React from 'react';
import styles from '../../../styles/components/molecules/OverlapMeetingsModal.module.scss';
import { formatCompactTimeRange } from '../../../util/timeFormat';
import { toPastelColor } from '../../../util/color';

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
    onClose: () => void;
    onSelectMeeting: (meetingId: string, el: HTMLElement) => void;
}

const OverlapMeetingsModal: React.FC<OverlapMeetingsModalProps> = ({
    isOpen,
    meetings,
    onClose,
    onSelectMeeting,
}) => {
    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalContent}>
                <div className={styles.header}>
                    <h2 className={styles.modalTitle}>
                        {meetings.length} Meeting{meetings.length === 1 ? '' : 's'} at This Time
                    </h2>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>

                <div className={styles.list}>
                    {meetings.map(meeting => {
                        const locationLabel = meeting.room || meeting.zoomRoom || '';
                        return (
                            <div
                                key={meeting.id}
                                className={styles.meetingItem}
                                style={{
                                    borderLeftColor: meeting.primaryColor,
                                    backgroundColor: meeting.primaryColor ? toPastelColor(meeting.primaryColor) : undefined,
                                }}
                                onClick={(e) => onSelectMeeting(meeting.id, e.currentTarget)}
                            >
                                <h3 className={styles.title}>{meeting.title}</h3>
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
                                    <div className={styles.tags}>
                                        {meeting.tags.map((tag, index) => (
                                            <span
                                                key={index}
                                                className={styles.tag}
                                                style={{ backgroundColor: meeting.primaryColor }}
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default OverlapMeetingsModal;

import React from 'react';
import styles from '../../../styles/components/meeting-form/ConflictOverrideModal.module.scss';
import { fieldLabel, formatOverlapSummary, formatMeetingSchedule, ConflictListRow } from '../admin/ConflictList';

interface ConflictOverrideModalProps {
  isOpen: boolean;
  conflicts: ConflictListRow[];
  onCancel: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
}

// Shown when a create/edit save collides on room or zoomRoom -- write/meeting and update/meeting
// both reject the save with a 409 + these rows (see findResourceConflictRows) unless the payload
// is resubmitted with confirmOverride: true. excludeMid already keeps the meeting being saved out
// of its own conflict rows, so every meeting listed here is a genuine other meeting -- no
// filtering needed before rendering.
const ConflictOverrideModal: React.FC<ConflictOverrideModalProps> = ({
  isOpen,
  conflicts,
  onCancel,
  onConfirm,
  isConfirming = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            <img src="/svg/warning-circle-icon.svg" alt="" width="20" height="20" />
          </span>
          <h2 className={styles.title}>Scheduling conflict</h2>
        </div>

        <p className={styles.message}>
          This meeting&apos;s room or Zoom room is already booked at this time. You can save anyway,
          or go back and change the room, Zoom room, or schedule.
        </p>

        <div className={styles.conflictList}>
          {conflicts.map((conflict, i) => (
            <div key={`${conflict.field}-${conflict.value}-${i}`} className={styles.conflictGroup}>
              <div className={styles.conflictMeta}>
                {fieldLabel(conflict.field)}: <span className={styles.conflictValue}>{conflict.value}</span>
              </div>
              <div className={styles.overlapSummary}>{formatOverlapSummary(conflict.overlap, conflict.meetings)}</div>
              {conflict.meetings.map((meeting) => (
                <div key={meeting.mid} className={styles.conflictEntry}>
                  <span className={styles.meetingTitle}>{meeting.title}</span>
                  <div className={styles.meetingSchedule}>{formatMeetingSchedule(meeting)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel} disabled={isConfirming}>Go back</button>
          <button className={styles.overrideButton} onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Saving…" : "Save anyway"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConflictOverrideModal;

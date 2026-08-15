import React from 'react';
import Icon from '../ui/displays/Icon';
import Modal from '../ui/overlays/Modal';
import styles from './ConflictOverrideModal.module.scss';
import { fieldLabel, formatOverlapSummary, formatMeetingSchedule, ConflictListRow } from '../../../util/meetings/conflictDisplay';

interface ConflictOverrideModalProps {
  isOpen: boolean;
  conflicts: ConflictListRow[];
  onCancel: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
}

// Shown when a create/edit save collides on room, zoomRoom, or an explicitly-picked zoomHost --
// write/meeting and update/meeting all reject the save with a 409 + these rows (see
// findResourceConflictRows) unless the payload is resubmitted with confirmOverride: true.
// excludeMid already keeps the meeting being saved out of its own conflict rows, so every
// meeting listed here is a genuine other meeting -- no filtering needed before rendering.
const ConflictOverrideModal: React.FC<ConflictOverrideModalProps> = ({
  isOpen,
  conflicts,
  onCancel,
  onConfirm,
  isConfirming = false,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    overlayClassName={styles.modalOverlay}
    contentClassName={styles.modalContent}
    labelledBy="conflict-override-title"
    preventClose={isConfirming}
  >
    <div className={styles.header}>
      <span className={styles.iconCircle}>
        <Icon name="warning-circle" size={20} />
      </span>
      <h2 id="conflict-override-title" className={styles.title}>Scheduling conflict</h2>
    </div>

    <p className={styles.message}>
      This meeting&apos;s room, Zoom room, or Zoom host is already booked at this time. You can save
      anyway, or go back and change the room, Zoom room, Zoom host, or schedule.
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
      <button className={styles.cancelButton} onClick={onCancel} disabled={isConfirming}>
        Go back
      </button>
      <button className={styles.overrideButton} onClick={onConfirm} disabled={isConfirming}>
        {isConfirming ? "Saving…" : "Save anyway"}
      </button>
    </div>
  </Modal>
);

export default ConflictOverrideModal;

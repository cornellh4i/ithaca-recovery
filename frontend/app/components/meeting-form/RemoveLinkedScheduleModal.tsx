import React from 'react';
import Icon from '../ui/displays/Icon';
import Modal from '../ui/overlays/Modal';
import styles from './RemoveLinkedScheduleModal.module.scss';

interface RemoveLinkedScheduleModalProps {
  isOpen: boolean;
  /** The meeting both schedules belong to. */
  title: string;
  /** The schedule being removed, e.g. "Zoom Only" / "Hybrid". */
  modeType: string;
  /** Its days and time, as the card shows them ("Sat · 9 - 10 AM"). */
  scheduleText: string;
  /**
   * What removing this schedule does to the meeting's one shared Zoom meeting: nothing at all
   * (an In-Person schedule was never part of it), 'kept' (the remaining schedule still runs on
   * it), or 'deleted' (this was the last schedule pointing at it).
   */
  zoomImpact: 'none' | 'kept' | 'deleted';
  onCancel: () => void;
  onConfirm: () => void;
}

// Confirms removing one schedule from a meeting that runs as two. Same shell, header treatment
// and button layout as DeleteMeetingModal -- this deletes a real Meeting row, so it gets the
// same weight as any other delete, not an inline "x".
const RemoveLinkedScheduleModal: React.FC<RemoveLinkedScheduleModalProps> = ({
  isOpen,
  title,
  modeType,
  scheduleText,
  zoomImpact,
  onCancel,
  onConfirm,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    overlayClassName={styles.modalOverlay}
    contentClassName={styles.modalContent}
    labelledBy="remove-linked-schedule-title"
  >
    <div className={styles.header}>
      <span className={styles.iconCircle}>
        <Icon name="delete" size={20} />
      </span>
      <h2 id="remove-linked-schedule-title" className={styles.title}>Remove this schedule?</h2>
    </div>

    <p className={styles.message}>
      <strong>{title}</strong>&apos;s <strong>{modeType}</strong> schedule
      (<strong className={styles.scheduleText}>{scheduleText}</strong>) will be permanently removed
      from the calendar. The meeting keeps its other schedule. This can&apos;t be undone.
    </p>

    {zoomImpact !== 'none' && (
      <div className={styles.zoomNote}>
        <Icon name="warning-circle" size={16} className={styles.noteIcon} />
        <span>
          {zoomImpact === 'kept'
            ? 'The shared Zoom meeting stays. Its schedule narrows to the remaining days the next time this meeting is saved.'
            : 'This is the only schedule using the meeting’s Zoom link, so that Zoom meeting is deleted too.'}
        </span>
      </div>
    )}

    <div className={styles.buttonContainer}>
      <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      <button className={styles.deleteButton} onClick={onConfirm}>Remove schedule</button>
    </div>
  </Modal>
);

export default RemoveLinkedScheduleModal;

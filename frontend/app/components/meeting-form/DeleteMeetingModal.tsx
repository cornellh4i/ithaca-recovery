import React from 'react';
import Icon from '../ui/displays/Icon';
import styles from './DeleteMeetingModal.module.scss';

interface DeleteMeetingModalProps {
  isOpen: boolean;
  title: string;
  timeRangeText: string;
  effectiveDateText: string;
  onCancel: () => void;
  onConfirm: () => void;
  // Omitted entirely (not shown disabled) when the caller has no suspend action wired up.
  onSuspendInstead?: () => void;
}

const DeleteMeetingModal: React.FC<DeleteMeetingModalProps> = ({
  isOpen,
  title,
  timeRangeText,
  effectiveDateText,
  onCancel,
  onConfirm,
  onSuspendInstead,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            <Icon name="delete" size={20} />
          </span>
          <h2 className={styles.title}>Delete this meeting?</h2>
        </div>

        <p className={styles.message}>
          <strong>{title}</strong> ({timeRangeText}) will be permanently removed from the
          calendar starting <strong className={styles.effectiveDate}>{effectiveDateText}</strong>.
          This can&apos;t be undone.
        </p>

        {onSuspendInstead && (
          <div className={styles.suspendNudge}>
            <Icon name="warning-circle" size={16} className={styles.nudgeIcon} />
            <span>
              Not sure? <strong>Suspend</strong> instead — the meeting is paused and hidden from the
              calendar, but can be viewed from the admin dashboard and reactivated. <strong>Delete</strong> is
              permanent.
            </span>
          </div>
        )}

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          {onSuspendInstead && (
            <button className={styles.suspendButton} onClick={onSuspendInstead}>Suspend</button>
          )}
          <button className={styles.deleteButton} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
};

export default DeleteMeetingModal;

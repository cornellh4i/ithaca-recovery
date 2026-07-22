import React from 'react';
import styles from '../../../styles/components/molecules/DeleteMeetingModal.module.scss';

interface DeleteMeetingModalProps {
  isOpen: boolean;
  title: string;
  timeRangeText: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const DeleteMeetingModal: React.FC<DeleteMeetingModalProps> = ({
  isOpen,
  title,
  timeRangeText,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            {/* Same path as /svg/delete-icon.svg, inlined so the fill can be
                recolored — an <img>-loaded SVG's internal fill can't be
                overridden via CSS. */}
            <svg className={styles.icon} viewBox="0 -960 960 960" width="20" height="20">
              <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
            </svg>
          </span>
          <h2 className={styles.title}>Delete this meeting?</h2>
        </div>

        <p className={styles.message}>
          <strong>{title}</strong> ({timeRangeText}) will be permanently removed from the
          calendar. This can&apos;t be undone.
        </p>

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          <button className={styles.deleteButton} onClick={onConfirm}>Delete meeting</button>
        </div>
      </div>
    </div>
  );
};

export default DeleteMeetingModal;

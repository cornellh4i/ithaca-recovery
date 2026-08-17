import React from 'react';
import Icon from '../ui/displays/Icon';
import Modal from '../ui/overlays/Modal';
import styles from './DiscardChangesModal.module.scss';

interface DiscardChangesModalProps {
  isOpen: boolean;
  // What's being abandoned, e.g. "new meeting" / "edits to this meeting".
  subject: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
}

const DiscardChangesModal: React.FC<DiscardChangesModalProps> = ({
  isOpen,
  subject,
  onKeepEditing,
  onDiscard,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onKeepEditing}
    overlayClassName={styles.modalOverlay}
    contentClassName={styles.modalContent}
    labelledBy="discard-changes-title"
  >
    <div className={styles.header}>
      <span className={styles.iconCircle}>
        <Icon name="warning-circle" size={20} />
      </span>
      <h2 id="discard-changes-title" className={styles.title}>Discard unsaved changes?</h2>
    </div>

    <p className={styles.message}>
      Your {subject} hasn&apos;t been saved. Closing this panel discards it.
    </p>

    <div className={styles.buttonContainer}>
      <button type="button" className={styles.cancelButton} onClick={onKeepEditing}>Keep editing</button>
      <button type="button" className={styles.discardButton} onClick={onDiscard}>Discard</button>
    </div>
  </Modal>
);

export default DiscardChangesModal;

"use client";

import React from "react";
import Icon from "../../ui/displays/Icon";
import Modal from "../../ui/overlays/Modal";
import styles from "./UserModals.module.scss";

interface RemoveUserModalProps {
  isOpen: boolean;
  email: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const RemoveUserModal: React.FC<RemoveUserModalProps> = ({ isOpen, email, onCancel, onConfirm }) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    overlayClassName={styles.modalOverlay}
    contentClassName={styles.modalContent}
    labelledBy="remove-user-modal-title"
  >
    <div className={styles.header}>
      <span className={styles.iconCircleDanger}>
        <Icon name="priority-high" size={20} />
      </span>
      <h2 id="remove-user-modal-title" className={styles.title}>Remove this user?</h2>
    </div>

    <p className={styles.message}>
      <strong>{email}</strong>{" "}will lose access immediately. This can&apos;t be undone.
    </p>

    <div className={styles.buttonContainer}>
      <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      <button className={styles.dangerButton} onClick={onConfirm}>Remove</button>
    </div>
  </Modal>
);

export default RemoveUserModal;

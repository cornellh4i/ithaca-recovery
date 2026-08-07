"use client";

import React from "react";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import styles from "../../../../styles/components/admin/UserModals.module.scss";

interface RemoveUserModalProps {
  isOpen: boolean;
  email: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const RemoveUserModal: React.FC<RemoveUserModalProps> = ({ isOpen, email, onCancel, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircleDanger}>
            <PriorityHighIcon fontSize="small" />
          </span>
          <h2 className={styles.title}>Remove this user?</h2>
        </div>

        <p className={styles.message}>
          <strong>{email}</strong>{" "}will lose access immediately. This can&apos;t be undone.
        </p>

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          <button className={styles.dangerButton} onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>
  );
};

export default RemoveUserModal;

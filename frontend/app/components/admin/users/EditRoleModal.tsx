"use client";

import React, { useLayoutEffect, useState } from "react";
import type { Role } from "@prisma/client";
import Icon from "../../ui/displays/Icon";
import Modal from "../../ui/overlays/Modal";
import RadioGroup from "../../ui/inputs/RadioGroup";
import { ROLE_LABEL, LABEL_TO_ROLE, ROLE_OPTIONS } from "../../../../util/roles";
import styles from "./UserModals.module.scss";

interface EditRoleModalProps {
  isOpen: boolean;
  name: string;
  email: string;
  currentRole: Role;
  isLastSuperAdmin: boolean;
  onCancel: () => void;
  onConfirm: (role: Role) => void;
}

const EditRoleModal: React.FC<EditRoleModalProps> = ({
  isOpen,
  name,
  email,
  currentRole,
  isLastSuperAdmin,
  onCancel,
  onConfirm,
}) => {
  const [selected, setSelected] = useState(ROLE_LABEL[currentRole]);

  // Re-syncs to whichever row's kebab menu triggered this (mount-once modal, not remounted
  // per row) and resets any stale selection from a previous open. useLayoutEffect, not
  // useEffect -- runs before paint, so a reopen for a different row can't flash the previous
  // row's selection first (same reasoning as TextField/DayView/WeekView's own useLayoutEffect
  // usage elsewhere in this codebase).
  useLayoutEffect(() => {
    if (isOpen) setSelected(ROLE_LABEL[currentRole]);
  }, [isOpen, currentRole]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      overlayClassName={styles.modalOverlay}
      contentClassName={styles.modalContent}
      labelledBy="edit-role-modal-title"
    >
      <div className={styles.header}>
        <span className={styles.iconCircle}>
          <Icon name="manage-accounts" size={16} />
        </span>
        <h2 id="edit-role-modal-title" className={styles.title}>Change role</h2>
      </div>

      <p className={styles.subject}>
        <strong>{name || email}</strong>
        {name && <span>{email}</span>}
      </p>

      {isLastSuperAdmin && (
        <div className={styles.warningNudge}>
          <Icon name="warning-circle" size={16} className={styles.warningNudgeIcon} />
          <span>Can&apos;t change the last Super Admin&apos;s role.</span>
        </div>
      )}

      <RadioGroup
        label=""
        name="edit-role"
        options={ROLE_OPTIONS}
        selectedOption={selected}
        onChange={setSelected}
        disabledOptions={isLastSuperAdmin ? ROLE_OPTIONS : []}
        style={{ paddingLeft: "48px" }}
      />

      <div className={styles.buttonContainer}>
        <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
        <button
          className={styles.confirmButton}
          onClick={() => onConfirm(LABEL_TO_ROLE[selected])}
          disabled={isLastSuperAdmin}
        >
          Update Role
        </button>
      </div>
    </Modal>
  );
};

export default EditRoleModal;

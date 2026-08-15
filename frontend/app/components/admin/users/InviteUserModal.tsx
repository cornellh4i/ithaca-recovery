"use client";

import React, { useLayoutEffect, useState } from "react";
import type { Role } from "@prisma/client";
import Icon from "../../ui/displays/Icon";
import Modal from "../../ui/overlays/Modal";
import RadioGroup from "../../ui/inputs/RadioGroup";
import TextField from "../../ui/inputs/TextField";
import { LABEL_TO_ROLE, ROLE_OPTIONS } from "../../../../util/roles";
import styles from "./UserModals.module.scss";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InviteUserModalProps {
  isOpen: boolean;
  inviting: boolean;
  onCancel: () => void;
  onInvite: (email: string, role: Role) => void;
}

const InviteUserModal: React.FC<InviteUserModalProps> = ({ isOpen, inviting, onCancel, onInvite }) => {
  const [email, setEmail] = useState("");
  const [roleOption, setRoleOption] = useState("Admin");
  const [touched, setTouched] = useState(false);

  // Mount-once modal (isOpen just gates render) -- reset the form fresh each time it opens
  // rather than leaving the previous invite's typed email behind. useLayoutEffect, not
  // useEffect -- runs before paint, so reopening can't flash the previous session's stale
  // email/role for one frame before the reset lands (same reasoning as EditRoleModal's).
  useLayoutEffect(() => {
    if (isOpen) {
      setEmail("");
      setRoleOption("Admin");
      setTouched(false);
    }
  }, [isOpen]);

  const trimmedEmail = email.trim();
  const isValid = EMAIL_PATTERN.test(trimmedEmail);

  const handleInvite = () => {
    if (!isValid) {
      setTouched(true);
      return;
    }
    onInvite(trimmedEmail, LABEL_TO_ROLE[roleOption]);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      overlayClassName={styles.modalOverlay}
      contentClassName={styles.modalContent}
      labelledBy="invite-user-modal-title"
      preventClose={inviting}
    >
      <div className={styles.header}>
        <span className={styles.iconCircle}>
          <Icon name="person-add" size={16} />
        </span>
        <h2 id="invite-user-modal-title" className={styles.title}>Invite user</h2>
      </div>

      <div className={styles.field}>
        <TextField
          input="Email address"
          aria-label="Email address"
          value={email}
          onChange={(value) => { setEmail(value); setTouched(true); }}
          style={{ fontSize: "15px" }}
        />
        {touched && !isValid && <p className={styles.fieldError}>Enter a valid email address.</p>}
      </div>

      <RadioGroup
        label="Role"
        name="invite-role"
        options={ROLE_OPTIONS}
        selectedOption={roleOption}
        onChange={setRoleOption}
        style={{ paddingLeft: "48px" }}
      />

      <div className={styles.buttonContainer}>
        <button className={styles.cancelButton} onClick={onCancel} disabled={inviting}>Cancel</button>
        <button
          className={styles.confirmButtonOutline}
          onClick={handleInvite}
          disabled={!isValid || inviting}
        >
          Send Invite
        </button>
      </div>
    </Modal>
  );
};

export default InviteUserModal;

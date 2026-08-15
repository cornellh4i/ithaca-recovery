"use client";

import React, { useState } from "react";
import FilterGroup, { FilterGroupItem } from "../../shared/FilterGroup";
import Modal from "../../ui/overlays/Modal";
import { MEETING_EXPORT_FIELD_GROUPS, type MeetingExportFieldKey } from "../../../../util/meetings/meetingExportFields";
import styles from "./ExportTab.module.scss";

interface MeetingExportConfigModalProps {
  initialFields: MeetingExportFieldKey[];
  onCancel: () => void;
  onSave: (fields: MeetingExportFieldKey[]) => Promise<void>;
}

// A single neutral color for every checkbox's checked-state fill -- these are field toggles,
// not a color-coded palette like FilterGroup's usual room/category filter chips.
const FIELD_CHECKBOX_COLOR = "#CC3366";

const groupItems = (name: string): FilterGroupItem[] =>
  (MEETING_EXPORT_FIELD_GROUPS.find((g) => g.group === name)?.fields ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    color: FIELD_CHECKBOX_COLOR,
  }));

const MEETING_FIELDS = groupItems("Meeting");
const SCHEDULE_FIELDS = groupItems("Schedule");
const CONTACT_FIELDS = groupItems("Contact");

const MeetingExportConfigModal: React.FC<MeetingExportConfigModalProps> = ({ initialFields, onCancel, onSave }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialFields.map((f) => [f, true])),
  );
  const [saving, setSaving] = useState(false);

  const toggle = (key: string, value: boolean) => setChecked((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(checked)
        .filter(([, isChecked]) => isChecked)
        .map(([key]) => key) as MeetingExportFieldKey[];
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onCancel}
      overlayClassName={styles.modalOverlay}
      contentClassName={styles.modal}
      labelledBy="export-config-title"
    >
      <h3 id="export-config-title" className={styles.modalTitle}>Configure meeting export</h3>
      <p className={styles.modalIntro}>
        Meeting ID and Meeting Name are always included. Pick which other fields the export should have.
      </p>

      <div className={styles.filterGrid}>
        <FilterGroup title="MEETING" items={MEETING_FIELDS} checked={checked} onToggle={toggle} />
        <div>
          <FilterGroup title="SCHEDULE" items={SCHEDULE_FIELDS} checked={checked} onToggle={toggle} />
          <div className={styles.stackedGroup}>
            <FilterGroup title="CONTACT" items={CONTACT_FIELDS} checked={checked} onToggle={toggle} />
          </div>
        </div>
      </div>

      <div className={styles.modalActions}>
        <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
        <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
};

export default MeetingExportConfigModal;

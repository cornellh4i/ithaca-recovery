"use client";

import React, { useState } from "react";
import Icon from "../../ui/displays/Icon";
import Modal from "../../ui/overlays/Modal";
import type { ILeaseSettings, IRoomRate } from "../../../../types/models";
import type { LeaseYearCycle } from "../../../../util/lease/leaseYearCycles";
import styles from "./ExportTab.module.scss";

interface LeaseConfigModalProps {
  initial: ILeaseSettings;
  cycles: LeaseYearCycle[];
  onCancel: () => void;
  onSave: (next: ILeaseSettings) => Promise<void>;
}

interface CollapsibleSectionProps {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

// Shared shell for the modal's three sections -- only "Rooms & rates" starts open, so Save
// stays reachable without scrolling past the ~12 rental-agent address fields underneath it.
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, summary, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.collapsibleSection}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.collapsibleTitleRow}>
          <span className={styles.sectionLabel}>{title}</span>
          {!open && <span className={styles.collapsibleSummary}>{summary}</span>}
        </span>
        <Icon
          name="expand-more"
          size={16}
          className={`${styles.collapsibleChevron} ${open ? styles.collapsibleChevronOpen : ""}`}
        />
      </button>
      <div className={`${styles.collapsibleBody} ${open ? styles.collapsibleBodyOpen : ""}`}>
        <div className={styles.collapsibleBodyInner}>{children}</div>
      </div>
    </div>
  );
};

// Splits on the literal "{group}" placeholder and highlights each substituted occurrence, so a
// preview reads as "here's what a real recipient sees" rather than a plain copy of the template.
function renderTemplatePreview(template: string): React.ReactNode {
  const parts = template.split("{group}");
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 && <span className={styles.previewHighlight}>Sample Group</span>}
    </React.Fragment>
  ));
}

const LeaseConfigModal: React.FC<LeaseConfigModalProps> = ({ initial, cycles, onCancel, onSave }) => {
  const [draft, setDraft] = useState<ILeaseSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [templatePreview, setTemplatePreview] = useState(false);

  const updateRoom = (index: number, patch: Partial<IRoomRate>) => {
    setDraft((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room, i) => (i === index ? { ...room, ...patch } : room)),
    }));
  };

  const selectCycle = (cycle: LeaseYearCycle) => {
    setDraft((prev) => ({ ...prev, leaseStartDate: cycle.startDate, leaseEndDate: cycle.endDate }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const roomsSummary = `${draft.rooms.length} room ${draft.rooms.length === 1 ? "rate" : "rates"} configured`;
  const contactSummary = `${draft.agentFirstName} ${draft.agentLastName} · ${draft.agentEmail}`;
  const templateSummary = draft.emailTemplate.split("\n")[0]?.slice(0, 60) || "No message set";

  return (
    <Modal
      isOpen
      onClose={onCancel}
      overlayClassName={styles.modalOverlay}
      contentClassName={styles.modal}
      labelledBy="lease-config-title"
      preventClose={saving}
    >
        <h3 id="lease-config-title" className={styles.modalTitle}>Configure PandaDocs lease export</h3>
        <p className={styles.modalIntro}>
          These settings control the lease period, rates, rental agent contact, and email wording used when
          generating the export. Per-meeting details (group name, contact email, schedule) always come from the
          meeting itself and aren&apos;t set here.
        </p>

        <div className={styles.sectionLabel}>Lease period</div>
        <div className={styles.cycleList}>
          {cycles.map((cycle) => {
            // Containment, not exact-match -- a pre-existing saved lease period may predate this
            // picker and not land exactly on a cycle boundary; falling inside a cycle's range
            // still highlights that cycle instead of leaving every row unselected.
            const draftStart = new Date(draft.leaseStartDate);
            const isSelected = draftStart >= cycle.startDate && draftStart <= cycle.endDate;
            return (
              <label
                key={cycle.label}
                className={`${styles.cycleRow} ${isSelected ? styles.cycleRowSelected : ""}`}
              >
                <input
                  type="radio"
                  name="lease-year-cycle"
                  className={styles.cycleRadioInput}
                  checked={isSelected}
                  onChange={() => selectCycle(cycle)}
                />
                <span className={styles.cycleRadioIcon}>
                  {isSelected ? <Icon name="check-circle" size={16} /> : <span className={styles.cycleRadioEmpty} />}
                </span>
                <span className={`${styles.cycleLabel} ${cycle.status === "current" ? styles.cycleLabelCurrent : ""}`}>
                  {cycle.label}
                </span>
                {cycle.status !== "current" && (
                  <span className={styles.cycleStatusTag}>
                    {cycle.status === "past" ? "Past" : "Not started"}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <CollapsibleSection title="Rooms & rates" summary={roomsSummary} defaultOpen>
          <div className={styles.ratesTableWrapper}>
            <table className={styles.ratesTable}>
              <thead>
                <tr>
                  <th>Room / Zoom account</th>
                  <th>Rate</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {draft.rooms.map((room, i) => (
                  <tr key={room.room}>
                    <td>{room.room}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={styles.rateInput}
                        value={room.rate}
                        onChange={(e) => updateRoom(i, { rate: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        className={styles.input}
                        value={room.unit}
                        onChange={(e) => updateRoom(i, { unit: e.target.value as IRoomRate["unit"] })}
                      >
                        <option value="hr">/hr</option>
                        <option value="month">/month</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Rental agent contact" summary={contactSummary}>
          <p className={styles.fieldHint}>Printed on every lease as the ICR contact — update when staff changes.</p>
          <div className={styles.contactGrid}>
            <label className={styles.fieldLabel}>
              First name
              <input className={styles.input} value={draft.agentFirstName} onChange={(e) => setDraft((p) => ({ ...p, agentFirstName: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              Last name
              <input className={styles.input} value={draft.agentLastName} onChange={(e) => setDraft((p) => ({ ...p, agentLastName: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              Title
              <input className={styles.input} value={draft.agentTitle} onChange={(e) => setDraft((p) => ({ ...p, agentTitle: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              Email
              <input className={styles.input} value={draft.agentEmail} onChange={(e) => setDraft((p) => ({ ...p, agentEmail: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              Phone
              <input className={styles.input} value={draft.agentPhone} onChange={(e) => setDraft((p) => ({ ...p, agentPhone: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              Street address
              <input className={styles.input} value={draft.agentStreetAddress} onChange={(e) => setDraft((p) => ({ ...p, agentStreetAddress: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              City
              <input className={styles.input} value={draft.agentCity} onChange={(e) => setDraft((p) => ({ ...p, agentCity: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              State
              <input className={styles.input} value={draft.agentState} onChange={(e) => setDraft((p) => ({ ...p, agentState: e.target.value }))} />
            </label>
            <label className={styles.fieldLabel}>
              ZIP
              <input className={styles.input} value={draft.agentZip} onChange={(e) => setDraft((p) => ({ ...p, agentZip: e.target.value }))} />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Email message template" summary={templateSummary}>
          <div className={styles.templateHeaderRow}>
            <span className={styles.templateStateLabel}>
              {templatePreview
                ? <>Previewing — <code className={styles.code}>{"{group}"}</code> shown as a sample group name</>
                : "Editing template"}
            </span>
            <button
              type="button"
              className={styles.previewToggleButton}
              onClick={() => setTemplatePreview((v) => !v)}
            >
              {templatePreview ? "Edit" : "Preview"}
            </button>
          </div>
          {templatePreview ? (
            <div className={styles.textareaPreview}>{renderTemplatePreview(draft.emailTemplate)}</div>
          ) : (
            <textarea
              className={styles.textarea}
              rows={5}
              value={draft.emailTemplate}
              onChange={(e) => setDraft((p) => ({ ...p, emailTemplate: e.target.value }))}
            />
          )}
          <p className={styles.fieldHint}>
            Sent with every lease. <code className={styles.code}>{"{group}"}</code> is replaced with each group&apos;s name.
          </p>
        </CollapsibleSection>

        <div className={styles.modalActions}>
          <button className={styles.cancelButton} onClick={onCancel} disabled={saving}>Cancel</button>
          <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
    </Modal>
  );
};

export default LeaseConfigModal;

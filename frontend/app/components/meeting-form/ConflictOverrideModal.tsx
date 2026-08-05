import React, { useEffect, useRef } from 'react';
import styles from '../../../styles/components/meeting-form/ConflictOverrideModal.module.scss';
import { fieldLabel, formatOverlapSummary, formatMeetingSchedule, ConflictListRow } from '../../../util/conflictDisplay';

interface ConflictOverrideModalProps {
  isOpen: boolean;
  conflicts: ConflictListRow[];
  onCancel: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
}

// Shown when a create/edit save collides on room, zoomRoom, or an explicitly-picked zoomHost --
// write/meeting and update/meeting all reject the save with a 409 + these rows (see
// findResourceConflictRows) unless the payload is resubmitted with confirmOverride: true.
// excludeMid already keeps the meeting being saved out of its own conflict rows, so every
// meeting listed here is a genuine other meeting -- no filtering needed before rendering.
const ConflictOverrideModal: React.FC<ConflictOverrideModalProps> = ({
  isOpen,
  conflicts,
  onCancel,
  onConfirm,
  isConfirming = false,
}) => {
  // "Go back" (the non-destructive default) gets initial focus, mirroring BottomSheet.tsx's own
  // focus-on-open/restore-on-close pattern -- without this, focus stays on the form's now-
  // re-enabled submit button underneath, and Enter/Space could resubmit it while this is up.
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="conflict-override-title">
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            <img src="/svg/warning-circle-icon.svg" alt="" width="20" height="20" />
          </span>
          <h2 id="conflict-override-title" className={styles.title}>Scheduling conflict</h2>
        </div>

        <p className={styles.message}>
          This meeting&apos;s room, Zoom room, or Zoom host is already booked at this time. You can save
          anyway, or go back and change the room, Zoom room, Zoom host, or schedule.
        </p>

        <div className={styles.conflictList}>
          {conflicts.map((conflict, i) => (
            <div key={`${conflict.field}-${conflict.value}-${i}`} className={styles.conflictGroup}>
              <div className={styles.conflictMeta}>
                {fieldLabel(conflict.field)}: <span className={styles.conflictValue}>{conflict.value}</span>
              </div>
              <div className={styles.overlapSummary}>{formatOverlapSummary(conflict.overlap, conflict.meetings)}</div>
              {conflict.meetings.map((meeting) => (
                <div key={meeting.mid} className={styles.conflictEntry}>
                  <span className={styles.meetingTitle}>{meeting.title}</span>
                  <div className={styles.meetingSchedule}>{formatMeetingSchedule(meeting)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.buttonContainer}>
          <button ref={cancelButtonRef} className={styles.cancelButton} onClick={onCancel} disabled={isConfirming}>
            Go back
          </button>
          <button className={styles.overrideButton} onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Saving…" : "Save anyway"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConflictOverrideModal;

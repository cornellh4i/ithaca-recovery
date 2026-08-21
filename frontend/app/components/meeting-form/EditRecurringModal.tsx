import React, { useEffect, useState } from 'react';
import Icon from '../ui/displays/Icon';
import Modal from '../ui/overlays/Modal';
import styles from './EditRecurringModal.module.scss';

export type EditScope = 'this' | 'thisAndFollowing' | 'all';

interface EditRecurringModalProps {
  isOpen: boolean;
  title: string;
  effectiveDateText: string;
  onClose: () => void;
  onSave: (option: EditScope) => void;
  // True when the form's recurrence settings were changed in this edit session -- the server
  // 400s a scope: 'this' payload that still carries recurrencePattern, so that option is
  // disabled rather than silently dropping the user's recurrence change. Independent of
  // disableScopedEdits below: a recurrence change alone still allows 'thisAndFollowing'.
  disableThis?: boolean;
  // True when Mode or Zoom Host were changed -- the server always applies both to the whole
  // series (400s any scoped save that carries either), so BOTH scoped options are disabled and
  // the choice is forced to 'all'.
  disableScopedEdits?: boolean;
  // True when the Date field was changed -- 'thisAndFollowing' would give the child row a
  // startDateTime taken from the edited Date field while its RecurrencePattern.startDate is
  // taken from the clicked occurrenceDate, a divergent anchor. A date change is unambiguous for
  // 'this' (move one occurrence -- keeps working exactly as today, including the re-anchor
  // logic in EditMeeting.tsx) but ambiguous for 'thisAndFollowing' (a weekday shift for future
  // occurrences belongs in the recurrence editor's daysOfWeek, not the Date field), so only
  // 'thisAndFollowing' is disabled here -- 'this' and 'all' stay available.
  disableThisAndFollowing?: boolean;
  // True when the caller has no specific occurrence to scope against -- e.g. the Diagnostics
  // Sync Issues panel, which edits a meeting with no click to attribute a date to.
  // 'this'/'thisAndFollowing' both need an occurrenceDate the server can validate; without one
  // they'd 400. Disables both scoped options and forces 'all', mirroring
  // DeleteRecurringModal's disableScoped gate.
  disableScoped?: boolean;
}

const EditRecurringModal: React.FC<EditRecurringModalProps> = ({
  isOpen,
  title,
  effectiveDateText,
  onClose,
  onSave,
  disableThis = false,
  disableScopedEdits = false,
  disableThisAndFollowing = false,
  disableScoped = false,
}) => {
  const [selectedOption, setSelectedOption] = useState<EditScope>('this');

  const isThisDisabled = disableThis || disableScopedEdits || disableScoped;
  const isThisAndFollowingDisabled = disableScopedEdits || disableThisAndFollowing || disableScoped;

  // Keeps a disabled option from staying selected once a form change makes it unavailable --
  // re-checked each time the modal opens rather than continuously, so it doesn't fight a
  // mid-session click back to a valid option. Falls through 'this' -> 'thisAndFollowing' -> 'all'
  // to land on the first option that's still actually selectable -- e.g. recurrence-dirty +
  // date-dirty together disable both scoped options, so this jumps straight to 'all' rather
  // than stopping on the equally-disabled 'thisAndFollowing'.
  useEffect(() => {
    if (!isOpen) return;
    if (selectedOption === 'this' && isThisDisabled) {
      setSelectedOption(isThisAndFollowingDisabled ? 'all' : 'thisAndFollowing');
    } else if (selectedOption === 'thisAndFollowing' && isThisAndFollowingDisabled) {
      setSelectedOption('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isThisDisabled, isThisAndFollowingDisabled]);

  const handleOptionSelect = (option: EditScope) => {
    setSelectedOption(option);
  };

  const handleSave = () => {
    onSave(selectedOption);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName={styles.modalOverlay}
      contentClassName={styles.modalContent}
      labelledBy="edit-recurring-title"
    >
      <div className={styles.header}>
        <span className={styles.iconCircle}>
          <Icon name="repeat" size={20} />
        </span>
        <h2 id="edit-recurring-title" className={styles.modalTitle}>Edit recurring event</h2>
      </div>

      <p className={styles.message}>
        {selectedOption === 'this' ? (
          <>
            Only the occurrence of <strong>{title}</strong> on{' '}
            <strong className={styles.effectiveDate}>{effectiveDateText}</strong> will change —
            it becomes a standalone meeting, separate from the series.
          </>
        ) : selectedOption === 'thisAndFollowing' ? (
          <>
            <strong>{title}</strong> will change starting{' '}
            <strong className={styles.effectiveDate}>{effectiveDateText}</strong>, including
            every occurrence after it. The series splits into two at this date.
          </>
        ) : (
          <>
            <strong>{title}</strong> will change across the entire series — every occurrence,
            including ones before{' '}
            <strong className={styles.effectiveDate}>{effectiveDateText}</strong>.
          </>
        )}{' '}
        The Zoom link stays the same.
      </p>

      <div className={styles.optionsContainer}>
        <div className={`${styles.optionItem} ${isThisDisabled ? styles.optionItemDisabled : ''}`}>
          <input
            type="radio"
            id="edit-this-event"
            name="edit-option"
            checked={selectedOption === 'this'}
            onChange={() => handleOptionSelect('this')}
            disabled={isThisDisabled}
            className={styles.radioInput}
          />
          <label htmlFor="edit-this-event" className={styles.radioLabel}>This event</label>
        </div>

        <div className={`${styles.optionItem} ${isThisAndFollowingDisabled ? styles.optionItemDisabled : ''}`}>
          <input
            type="radio"
            id="edit-this-and-following"
            name="edit-option"
            checked={selectedOption === 'thisAndFollowing'}
            onChange={() => handleOptionSelect('thisAndFollowing')}
            disabled={isThisAndFollowingDisabled}
            className={styles.radioInput}
          />
          <label htmlFor="edit-this-and-following" className={styles.radioLabel}>This and following events</label>
        </div>

        {/* disableScoped (no occurrence context at all) and disableScopedEdits (mode/host
            changes apply to the whole series) each disable both scoped options on their own --
            shown in preference to the narrower recurrence/date hints below, which can
            legitimately show together (e.g. recurrence-dirty + date-dirty leaves only 'all'
            selectable, for two different reasons) once neither of these applies. */}
        {disableScoped ? (
          <p className={styles.disabledHint}>
            Open the meeting from a calendar day to edit specific occurrences.
          </p>
        ) : disableScopedEdits ? (
          <p className={styles.disabledHint}>
            Mode and host changes apply to the whole series, so this option isn&apos;t available.
          </p>
        ) : (
          <>
            {disableThis && (
              <p className={styles.disabledHint}>
                Recurrence changes apply to the whole series, so this option isn&apos;t available.
              </p>
            )}
            {disableThisAndFollowing && (
              <p className={styles.disabledHint}>
                Date changes apply to a single event or the whole series.
              </p>
            )}
          </>
        )}

        <div className={styles.optionItem}>
          <input
            type="radio"
            id="edit-all-events"
            name="edit-option"
            checked={selectedOption === 'all'}
            onChange={() => handleOptionSelect('all')}
            className={styles.radioInput}
          />
          <label htmlFor="edit-all-events" className={styles.radioLabel}>All events</label>
        </div>
      </div>

      <div className={styles.buttonContainer}>
        <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
        <button className={styles.saveButton} onClick={handleSave}>Save</button>
      </div>
    </Modal>
  );
};

export default EditRecurringModal;

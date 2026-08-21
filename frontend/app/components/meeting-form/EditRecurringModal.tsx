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
}

const EditRecurringModal: React.FC<EditRecurringModalProps> = ({
  isOpen,
  title,
  effectiveDateText,
  onClose,
  onSave,
  disableThis = false,
  disableScopedEdits = false,
}) => {
  const [selectedOption, setSelectedOption] = useState<EditScope>('this');

  // Keeps a disabled option from staying selected once a form change makes it unavailable --
  // re-checked each time the modal opens rather than continuously, so it doesn't fight a
  // mid-session click back to a valid option. Falls through 'this' -> 'thisAndFollowing' -> 'all'
  // to land on the first option that's still actually selectable.
  useEffect(() => {
    if (!isOpen) return;
    if (selectedOption === 'this' && (disableThis || disableScopedEdits)) {
      setSelectedOption(disableScopedEdits ? 'all' : 'thisAndFollowing');
    } else if (selectedOption === 'thisAndFollowing' && disableScopedEdits) {
      setSelectedOption('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, disableThis, disableScopedEdits]);

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
        <div className={`${styles.optionItem} ${(disableThis || disableScopedEdits) ? styles.optionItemDisabled : ''}`}>
          <input
            type="radio"
            id="edit-this-event"
            name="edit-option"
            checked={selectedOption === 'this'}
            onChange={() => handleOptionSelect('this')}
            disabled={disableThis || disableScopedEdits}
            className={styles.radioInput}
          />
          <label htmlFor="edit-this-event" className={styles.radioLabel}>This event</label>
        </div>

        <div className={`${styles.optionItem} ${disableScopedEdits ? styles.optionItemDisabled : ''}`}>
          <input
            type="radio"
            id="edit-this-and-following"
            name="edit-option"
            checked={selectedOption === 'thisAndFollowing'}
            onChange={() => handleOptionSelect('thisAndFollowing')}
            disabled={disableScopedEdits}
            className={styles.radioInput}
          />
          <label htmlFor="edit-this-and-following" className={styles.radioLabel}>This and following events</label>
        </div>

        {/* Mode/host changes are the broader constraint (both scoped options unavailable) --
            shown in preference to the recurrence-only hint when both apply at once. */}
        {disableScopedEdits ? (
          <p className={styles.disabledHint}>
            Mode and host changes apply to the whole series, so this option isn&apos;t available.
          </p>
        ) : disableThis ? (
          <p className={styles.disabledHint}>
            Recurrence changes apply to the whole series, so this option isn&apos;t available.
          </p>
        ) : null}

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

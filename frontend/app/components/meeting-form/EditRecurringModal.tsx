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
  // disabled rather than silently dropping the user's recurrence change.
  disableThis?: boolean;
}

const EditRecurringModal: React.FC<EditRecurringModalProps> = ({
  isOpen,
  title,
  effectiveDateText,
  onClose,
  onSave,
  disableThis = false,
}) => {
  const [selectedOption, setSelectedOption] = useState<EditScope>('this');

  // Keeps the disabled "This event" option from staying selected once recurrence changes make
  // it unavailable -- re-checked each time the modal opens rather than continuously, so it
  // doesn't fight a mid-session click back to a valid option.
  useEffect(() => {
    if (isOpen && disableThis && selectedOption === 'this') {
      setSelectedOption('thisAndFollowing');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, disableThis]);

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
        <div className={`${styles.optionItem} ${disableThis ? styles.optionItemDisabled : ''}`}>
          <input
            type="radio"
            id="edit-this-event"
            name="edit-option"
            checked={selectedOption === 'this'}
            onChange={() => handleOptionSelect('this')}
            disabled={disableThis}
            className={styles.radioInput}
          />
          <label htmlFor="edit-this-event" className={styles.radioLabel}>This event</label>
        </div>
        {disableThis && (
          <p className={styles.disabledHint}>
            Recurrence changes apply to the whole series, so this option isn&apos;t available.
          </p>
        )}

        <div className={styles.optionItem}>
          <input
            type="radio"
            id="edit-this-and-following"
            name="edit-option"
            checked={selectedOption === 'thisAndFollowing'}
            onChange={() => handleOptionSelect('thisAndFollowing')}
            className={styles.radioInput}
          />
          <label htmlFor="edit-this-and-following" className={styles.radioLabel}>This and following events</label>
        </div>

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

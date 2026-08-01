import React, { useState } from 'react';
import styles from '../../../styles/components/meeting-form/DeleteRecurringModal.module.scss';
import TextButton from '../atoms/TextButton';

interface DeleteRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: (option: 'this' | 'thisAndFollowing' | 'all') => void;
  // Omitted entirely (not shown disabled) when the caller has no suspend action wired up.
  onSuspendInstead?: () => void;
}

const DeleteRecurringModal: React.FC<DeleteRecurringModalProps> = ({
  isOpen,
  onClose,
  onDelete,
  onSuspendInstead,
}) => {
  const [selectedOption, setSelectedOption] = useState<'this' | 'thisAndFollowing' | 'all'>('this');

  if (!isOpen) return null;

  const handleOptionSelect = (option: 'this' | 'thisAndFollowing' | 'all') => {
    setSelectedOption(option);
  };

  const handleDelete = () => {
    onDelete(selectedOption);
    onClose();
  };
  
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2 className={styles.modalTitle}>Delete recurring event</h2>

        <div className={styles.optionsContainer}>
          <div className={styles.optionItem}>
            <input
              type="radio"
              id="this-event"
              name="delete-option"
              checked={selectedOption === 'this'}
              onChange={() => handleOptionSelect('this')}
              className={styles.radioInput}
            />
            <label htmlFor="this-event" className={styles.radioLabel}>This event</label>
          </div>

          <div className={styles.optionItem}>
            <input
              type="radio"
              id="this-and-following"
              name="delete-option"
              checked={selectedOption === 'thisAndFollowing'}
              onChange={() => handleOptionSelect('thisAndFollowing')}
              className={styles.radioInput}
            />
            <label htmlFor="this-and-following" className={styles.radioLabel}>This and following events</label>
          </div>

          <div className={styles.optionItem}>
            <input
              type="radio"
              id="all-events"
              name="delete-option"
              checked={selectedOption === 'all'}
              onChange={() => handleOptionSelect('all')}
              className={styles.radioInput}
            />
            <label htmlFor="all-events" className={styles.radioLabel}>All events</label>
          </div>
        </div>

        {onSuspendInstead && (
          <div className={styles.suspendNudge}>
            Not sure? <strong>Suspend</strong> instead — the meeting is paused and hidden from the
            calendar, but can be viewed from the admin dashboard and reactivated. <strong>Delete</strong> is
            permanent.
          </div>
        )}

        <div className={styles.buttonContainer}>
          <TextButton label="Cancel" onClick={onClose} />
          {onSuspendInstead && <TextButton label="Suspend" onClick={onSuspendInstead} />}
          <TextButton label="OK" onClick={handleDelete} />
        </div>
      </div>
    </div>
  );
};

export default DeleteRecurringModal;

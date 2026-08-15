import React, { useState } from 'react';
import Icon from '../ui/displays/Icon';
import styles from './DeleteRecurringModal.module.scss';

interface DeleteRecurringModalProps {
  isOpen: boolean;
  title: string;
  effectiveDateText: string;
  onClose: () => void;
  onDelete: (option: 'this' | 'thisAndFollowing' | 'all') => void;
  // Omitted entirely (not shown disabled) when the caller has no suspend action wired up.
  onSuspendInstead?: () => void;
}

const DeleteRecurringModal: React.FC<DeleteRecurringModalProps> = ({
  isOpen,
  title,
  effectiveDateText,
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
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            <Icon name="delete" size={20} />
          </span>
          <h2 className={styles.modalTitle}>Delete recurring event</h2>
        </div>

        <p className={styles.message}>
          {selectedOption === 'this' ? (
            <>
              Only the occurrence of <strong>{title}</strong> on{' '}
              <strong className={styles.effectiveDate}>{effectiveDateText}</strong> will be
              permanently removed from the calendar.
            </>
          ) : selectedOption === 'thisAndFollowing' ? (
            <>
              <strong>{title}</strong> will be permanently removed from the calendar starting{' '}
              <strong className={styles.effectiveDate}>{effectiveDateText}</strong>, including
              every occurrence after it.
            </>
          ) : (
            <>
              <strong>{title}</strong> will be permanently removed from the calendar entirely —
              every occurrence, including ones before{' '}
              <strong className={styles.effectiveDate}>{effectiveDateText}</strong>.
            </>
          )}{' '}
          This action can&apos;t be undone.
        </p>

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
            <Icon name="warning-circle" size={16} className={styles.nudgeIcon} />
            <span>
              Not sure? <strong>Suspend</strong> instead — the meeting is paused and hidden from the
              calendar, but can be viewed from the admin dashboard and reactivated. <strong>Delete</strong> is
              permanent.
            </span>
          </div>
        )}

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
          {onSuspendInstead && (
            <button className={styles.suspendButton} onClick={onSuspendInstead}>Suspend</button>
          )}
          <button className={styles.deleteButton} onClick={handleDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
};

export default DeleteRecurringModal;

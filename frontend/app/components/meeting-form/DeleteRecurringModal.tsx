import React, { useEffect, useState } from 'react';
import Icon from '../ui/displays/Icon';
import Modal from '../ui/overlays/Modal';
import styles from './DeleteRecurringModal.module.scss';

interface DeleteRecurringModalProps {
  isOpen: boolean;
  title: string;
  effectiveDateText: string;
  onClose: () => void;
  onDelete: (option: 'this' | 'thisAndFollowing' | 'all') => void;
  // Omitted entirely (not shown disabled) when the caller has no suspend action wired up.
  onSuspendInstead?: () => void;
  // True when the caller has no specific occurrence to scope against -- e.g. the deep-link
  // (?mid=) path into a recurring meeting, which never sets lastClickedDate (there's no click
  // to attribute a date to). 'this'/'thisAndFollowing' both need an occurrenceDate the server
  // can validate; without one they'd 400. Disables both scoped options and forces 'all',
  // mirroring EditRecurringModal's disableScopedEdits gate.
  disableScoped?: boolean;
}

const DeleteRecurringModal: React.FC<DeleteRecurringModalProps> = ({
  isOpen,
  title,
  effectiveDateText,
  onClose,
  onDelete,
  onSuspendInstead,
  disableScoped = false,
}) => {
  const [selectedOption, setSelectedOption] = useState<'this' | 'thisAndFollowing' | 'all'>('this');

  // Keeps a disabled option from staying selected once disableScoped forces the choice --
  // re-checked each time the modal opens rather than continuously, so it doesn't fight a
  // mid-session click back to a valid option (not that there is one here besides 'all').
  useEffect(() => {
    if (isOpen && disableScoped && selectedOption !== 'all') {
      setSelectedOption('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, disableScoped]);

  const handleOptionSelect = (option: 'this' | 'thisAndFollowing' | 'all') => {
    setSelectedOption(option);
  };

  const handleDelete = () => {
    onDelete(selectedOption);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName={styles.modalOverlay}
      contentClassName={styles.modalContent}
      labelledBy="delete-recurring-title"
    >
      <div className={styles.header}>
        <span className={styles.iconCircle}>
          <Icon name="delete" size={20} />
        </span>
        <h2 id="delete-recurring-title" className={styles.modalTitle}>Delete recurring event</h2>
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
        <div className={`${styles.optionItem} ${disableScoped ? styles.optionItemDisabled : ''}`}>
          <input
            type="radio"
            id="this-event"
            name="delete-option"
            checked={selectedOption === 'this'}
            onChange={() => handleOptionSelect('this')}
            disabled={disableScoped}
            className={styles.radioInput}
          />
          <label htmlFor="this-event" className={styles.radioLabel}>This event</label>
        </div>

        <div className={`${styles.optionItem} ${disableScoped ? styles.optionItemDisabled : ''}`}>
          <input
            type="radio"
            id="this-and-following"
            name="delete-option"
            checked={selectedOption === 'thisAndFollowing'}
            onChange={() => handleOptionSelect('thisAndFollowing')}
            disabled={disableScoped}
            className={styles.radioInput}
          />
          <label htmlFor="this-and-following" className={styles.radioLabel}>This and following events</label>
        </div>

        {disableScoped && (
          <p className={styles.disabledHint}>
            Open the meeting from a calendar day to delete specific occurrences.
          </p>
        )}

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
    </Modal>
  );
};

export default DeleteRecurringModal;

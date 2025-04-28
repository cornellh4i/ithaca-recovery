import React, { useState } from 'react';
import styles from '../../../styles/components/molecules/DeleteRecurringModal.module.scss';
import TextButton from '../atoms/textbutton';

interface RecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  mid: string;
  onConfirm: (mid: string, option: 'this' | 'thisAndFollowing' | 'all', currentOccurrenceDate?: Date) => void;
  currentOccurrenceDate?: Date; 
  actionType: 'delete' | 'edit';
}

const DeleteRecurringModal: React.FC<RecurringModalProps> = ({
  isOpen,
  onClose,
  mid,
  onConfirm,
  currentOccurrenceDate,
  actionType,
}) => {
  const [selectedOption, setSelectedOption] = useState<'this' | 'thisAndFollowing' | 'all'>('this');

  if (!isOpen) return null;

  const handleOptionSelect = (option: 'this' | 'thisAndFollowing' | 'all') => {
    setSelectedOption(option);
  };

  const handleConfirm = () => {
    onConfirm(mid, selectedOption, currentOccurrenceDate);
    onClose();
  };

  const actionWord = actionType === 'delete' ? 'Delete' : 'Edit';
  
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2 className={styles.modalTitle}>{actionWord} recurring event</h2>

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

        <div className={styles.buttonContainer}>
          <TextButton label="Cancel" onClick={onClose} />
          <TextButton label="OK" onClick={handleConfirm} />
        </div>
      </div>
    </div>
  );
};

export default DeleteRecurringModal;

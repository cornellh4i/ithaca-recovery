import React, { useState } from 'react';
import styles from '../../../styles/components/molecules/DeleteRecurringModal.module.scss';
import TextButton from '../atoms/textbutton';

interface DeleteRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  mid: string;
  onDelete: (mid: string, option: 'this' | 'thisAndFollowing' | 'all', currentOccurrenceDate?: Date) => void;
  currentOccurrenceDate?: Date; 
}

const DeleteRecurringModal: React.FC<DeleteRecurringModalProps> = ({
  isOpen,
  onClose,
  mid,
  onDelete,
  currentOccurrenceDate
}) => {
  const [selectedOption, setSelectedOption] = useState<'this' | 'thisAndFollowing' | 'all'>('this');

  if (!isOpen) return null;

  const handleOptionSelect = (option: 'this' | 'thisAndFollowing' | 'all') => {
    setSelectedOption(option);
  };

  const handleDelete = () => {
    onDelete(mid, selectedOption, currentOccurrenceDate);
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

        <div className={styles.buttonContainer}>
          <TextButton label="Cancel" onClick={onClose} />
          <TextButton label="OK" onClick={handleDelete} />
        </div>
      </div>
    </div>
  );
};

export default DeleteRecurringModal;

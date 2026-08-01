import React, { useState } from 'react';
import styles from '../../../styles/components/meeting-form/SuspendMeetingModal.module.scss';

interface SuspendMeetingModalProps {
  isOpen: boolean;
  title: string;
  effectiveDateText: string;
  onCancel: () => void;
  onConfirm: (resumesAt: string | null) => void;
}

const SuspendMeetingModal: React.FC<SuspendMeetingModalProps> = ({
  isOpen,
  title,
  effectiveDateText,
  onCancel,
  onConfirm,
}) => {
  const [resumeOption, setResumeOption] = useState<'indefinite' | 'until'>('indefinite');
  const [resumeDate, setResumeDate] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(resumeOption === 'until' && resumeDate ? new Date(`${resumeDate}T00:00:00`).toISOString() : null);
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            {/* Same path as /svg/warning-icon.svg, inlined so the fill can be recolored. */}
            <svg className={styles.icon} viewBox="0 -960 960 960" width="20" height="20">
              <path d="M40-120l440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z" />
            </svg>
          </span>
          <h2 className={styles.title}>Suspend this meeting?</h2>
        </div>

        <p className={styles.message}>
          <strong>{title}</strong> will be paused and hidden from the calendar starting{' '}
          <strong className={styles.effectiveDate}>{effectiveDateText}</strong>, until reactivated.
          It can still be viewed and reactivated from the admin dashboard.
        </p>

        <div className={styles.resumeOptions}>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="resumeOption"
              checked={resumeOption === 'indefinite'}
              onChange={() => setResumeOption('indefinite')}
            />
            Indefinitely
          </label>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="resumeOption"
              checked={resumeOption === 'until'}
              onChange={() => setResumeOption('until')}
            />
            Until
            <input
              type="date"
              className={styles.dateInput}
              value={resumeDate}
              disabled={resumeOption !== 'until'}
              onChange={(e) => setResumeDate(e.target.value)}
              onClick={() => setResumeOption('until')}
            />
          </label>
        </div>

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          <button
            className={styles.suspendButton}
            onClick={handleConfirm}
            disabled={resumeOption === 'until' && !resumeDate}
          >
            Suspend meeting
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuspendMeetingModal;

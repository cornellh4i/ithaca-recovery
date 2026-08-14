import React, { useState } from 'react';
import styles from '../../../styles/components/meeting-form/SuspendMeetingModal.module.scss';
import DatePicker from '../atoms/DatePicker';
import Icon from '../atoms/Icon';
import { formatETDateString, parseMMDDYYYY } from '../../../util/date/timeUtils';

interface SuspendMeetingModalProps {
  isOpen: boolean;
  title: string;
  effectiveDateText: string;
  // The same date effectiveDateText describes, as an actual Date -- "Until" must be strictly
  // after it, otherwise the suspension's range would invert (to <= from) and the suspend route
  // would reject it. Already the final, clamped suspension start (see ViewMeeting's
  // suspendEffectiveDate); this modal doesn't need to re-clamp it.
  effectiveDate: string | Date;
  // Set only when the occurrence the admin clicked is in the past -- it can't retroactively
  // un-happen a past occurrence, so the suspension actually starts today instead (see
  // effectiveDateText, which already reflects that). This just clarifies why.
  pastOccurrenceDateText?: string;
  onCancel: () => void;
  onConfirm: (resumesAt: string | null) => void;
}

const SuspendMeetingModal: React.FC<SuspendMeetingModalProps> = ({
  isOpen,
  title,
  effectiveDateText,
  effectiveDate,
  pastOccurrenceDateText,
  onCancel,
  onConfirm,
}) => {
  const [resumeOption, setResumeOption] = useState<'indefinite' | 'until'>('indefinite');
  // DatePicker's own value/onChange contract is MM/DD/YYYY (see DatePicker.tsx's doc comment).
  const [resumeDate, setResumeDate] = useState('');

  if (!isOpen) return null;

  const minStr = formatETDateString(new Date(effectiveDate));
  const pickedDate = parseMMDDYYYY(resumeDate);
  const pickedStr = pickedDate ? formatETDateString(pickedDate) : null;
  const isUntilDateValid = pickedStr != null && pickedStr > minStr;

  const handleConfirm = () => {
    const picked = resumeOption === 'until' ? parseMMDDYYYY(resumeDate) : null;
    onConfirm(picked ? picked.toISOString() : null);
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            <Icon name="pause" size={20} />
          </span>
          <h2 className={styles.title}>Suspend this meeting?</h2>
        </div>

        <p className={styles.message}>
          <strong>{title}</strong> will be paused and hidden from the calendar starting{' '}
          <strong className={styles.effectiveDate}>{effectiveDateText}</strong>, until reactivated.
          It can still be viewed and reactivated from the admin dashboard.
        </p>

        {pastOccurrenceDateText && (
          <p className={styles.pastNotice}>
            {pastOccurrenceDateText} already happened, so suspending starts today instead.
          </p>
        )}

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
          <div className={styles.radioRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="resumeOption"
                checked={resumeOption === 'until'}
                onChange={() => setResumeOption('until')}
              />
              <span className={styles.untilLabel}>Until</span>
            </label>
            {resumeOption === 'until' && (
              <span className={styles.untilDatePicker}>
                <DatePicker label="" value={resumeDate} onChange={setResumeDate} underlineOnFocus={false} compact />
              </span>
            )}
          </div>
          {resumeOption === 'until' && resumeDate && !isUntilDateValid && (
            <p className={styles.dateError}>Must be after {effectiveDateText}.</p>
          )}
        </div>

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          <button
            className={styles.suspendButton}
            onClick={handleConfirm}
            disabled={resumeOption === 'until' && !isUntilDateValid}
          >
            Suspend
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuspendMeetingModal;

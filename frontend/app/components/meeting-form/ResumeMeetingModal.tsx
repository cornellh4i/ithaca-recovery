import React, { useState } from 'react';
import styles from '../../../styles/components/meeting-form/ResumeMeetingModal.module.scss';
import DatePicker from '../atoms/DatePicker';
import { formatETDateString } from '../../../util/timeUtils';

interface ResumeMeetingModalProps {
  isOpen: boolean;
  title: string;
  // The suspension's own start date -- "On" must be strictly after whichever is later: this or
  // today, otherwise the suspension's range would invert (to < from) and the resume route would
  // reject it. Optional since not every caller has it handy; when absent, only the server-side
  // check applies.
  suspendedSince?: string | Date | null;
  onCancel: () => void;
  // null = resume immediately (today); an ISO date string = schedule the resume for that date
  // instead, without reactivating the meeting yet.
  onConfirm: (on: string | null) => void;
}

const ResumeMeetingModal: React.FC<ResumeMeetingModalProps> = ({
  isOpen,
  title,
  suspendedSince,
  onCancel,
  onConfirm,
}) => {
  const [resumeOption, setResumeOption] = useState<'immediately' | 'on'>('immediately');
  // DatePicker's own value/onChange contract is MM/DD/YYYY (see DatePicker.tsx's doc comment).
  const [resumeDate, setResumeDate] = useState('');

  if (!isOpen) return null;

  const todayStr = formatETDateString(new Date());
  const sinceStr = suspendedSince ? formatETDateString(new Date(suspendedSince)) : null;
  const minStr = sinceStr && sinceStr > todayStr ? sinceStr : todayStr;

  const pickedStr = (() => {
    if (!resumeDate) return null;
    const [month, day, year] = resumeDate.split('/').map(Number);
    return formatETDateString(new Date(year, month - 1, day));
  })();
  const isOnDateValid = pickedStr != null && pickedStr > minStr;

  const handleConfirm = () => {
    if (resumeOption === 'on' && resumeDate) {
      const [month, day, year] = resumeDate.split('/').map(Number);
      onConfirm(new Date(year, month - 1, day).toISOString());
    } else {
      onConfirm(null);
    }
  };

  return (
    <div className={styles.modalOverlay} data-testid="resume-meeting-modal">
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            <img src="/svg/resume-icon.svg" alt="" width="20" height="20" />
          </span>
          <h2 className={styles.title}>Resume this meeting?</h2>
        </div>

        <p className={styles.message}>
          <strong>{title}</strong> can be reactivated right away, or kept suspended until a date
          you choose.
        </p>

        <div className={styles.resumeOptions}>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="resumeTiming"
              checked={resumeOption === 'immediately'}
              onChange={() => setResumeOption('immediately')}
            />
            Immediately (today)
          </label>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="resumeTiming"
              checked={resumeOption === 'on'}
              onChange={() => setResumeOption('on')}
            />
            <span className={styles.onLabel}>On</span>
            {resumeOption === 'on' && (
              <span className={styles.onDatePicker}>
                <DatePicker label="" value={resumeDate} onChange={setResumeDate} underlineOnFocus={false} compact />
              </span>
            )}
          </label>
          {resumeOption === 'on' && resumeDate && !isOnDateValid && (
            <p className={styles.dateError}>
              Must be after {sinceStr && sinceStr > todayStr ? "the suspension's start date" : "today"}.
            </p>
          )}
        </div>

        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          <button
            className={styles.resumeButton}
            onClick={handleConfirm}
            disabled={resumeOption === 'on' && !isOnDateValid}
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResumeMeetingModal;

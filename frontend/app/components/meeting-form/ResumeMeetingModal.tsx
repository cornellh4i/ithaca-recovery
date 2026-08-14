import React, { useState } from 'react';
import styles from '../../../styles/components/meeting-form/ResumeMeetingModal.module.scss';
import DatePicker from '../atoms/DatePicker';
import Icon from '../atoms/Icon';
import { formatETDateString, parseMMDDYYYY } from '../../../util/date/timeUtils';

interface ResumeMeetingModalProps {
  isOpen: boolean;
  title: string;
  // The suspension's own start date -- "On" must be strictly after whichever is later: this or
  // today, otherwise the suspension's range would invert (to < from) and the resume route would
  // reject it. Optional since not every caller has it handy; when absent, only the server-side
  // check applies.
  suspendedSince?: string | Date | null;
  // Whether the suspension being acted on has actually started (hiding the meeting today) vs.
  // is merely scheduled for a future date. Same distinction as ViewMeeting's isSuspended vs.
  // hasPendingSuspension -- a pending suspension hasn't hidden anything yet, so "Resume this
  // meeting?" / "Resume" would misleadingly imply reactivating something that's still showing
  // normally on the calendar. Defaults to true (the original, always-active-suspension copy)
  // so existing callers that haven't been updated yet keep their current behavior.
  isActive?: boolean;
  onCancel: () => void;
  // null = resume immediately (today); an ISO date string = schedule the resume for that date
  // instead, without reactivating the meeting yet.
  onConfirm: (on: string | null) => void;
}

const ResumeMeetingModal: React.FC<ResumeMeetingModalProps> = ({
  isOpen,
  title,
  suspendedSince,
  isActive = true,
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

  const pickedDate = parseMMDDYYYY(resumeDate);
  const pickedStr = pickedDate ? formatETDateString(pickedDate) : null;
  const isOnDateValid = pickedStr != null && pickedStr > minStr;

  const handleConfirm = () => {
    const picked = resumeOption === 'on' ? parseMMDDYYYY(resumeDate) : null;
    onConfirm(picked ? picked.toISOString() : null);
  };

  return (
    <div className={styles.modalOverlay} data-testid="resume-meeting-modal">
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <span className={styles.iconCircle}>
            <Icon name="resume" size={20} />
          </span>
          <h2 className={styles.title}>{isActive ? 'Resume this meeting?' : 'Cancel scheduled suspension?'}</h2>
        </div>

        <p className={styles.message}>
          {isActive ? (
            <>
              <strong>{title}</strong> can be reactivated right away, or kept suspended until a
              date you choose.
            </>
          ) : (
            <>
              <strong>{title}</strong>&apos;s scheduled suspension can be cancelled now, keeping
              it on the calendar as normal, or pushed to end on a different date.
            </>
          )}
        </p>

        <div className={styles.resumeOptions}>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="resumeTiming"
              checked={resumeOption === 'immediately'}
              onChange={() => setResumeOption('immediately')}
            />
            {isActive ? 'Immediately (today)' : 'Cancel now'}
          </label>
          <div className={styles.radioRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="resumeTiming"
                checked={resumeOption === 'on'}
                onChange={() => setResumeOption('on')}
              />
              <span className={styles.onLabel}>{isActive ? 'On' : 'End on'}</span>
            </label>
            {resumeOption === 'on' && (
              <span className={styles.onDatePicker}>
                <DatePicker label="" value={resumeDate} onChange={setResumeDate} underlineOnFocus={false} compact />
              </span>
            )}
          </div>
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
            {isActive ? 'Resume' : 'Cancel suspension'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResumeMeetingModal;

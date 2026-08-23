import React from 'react';

import CheckButton from '../buttons/CheckButton';
import { WEEKDAY_NAMES } from '../../../../util/date/timeUtils';
import styles from './DayPicker.module.scss';

// Sunday-first, matching WEEKDAY_NAMES' own order (and every recurrence pattern's
// firstDayOfWeek), so an index is the same day in both.
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface DayPickerProps {
  /** Full weekday names ("Monday"), as a recurrence pattern's daysOfWeek stores them. */
  selectedDays: string[];
  onToggleDay: (day: string) => void;
  /**
   * Days this picker may not take -- the weekdays another schedule of the same meeting already
   * claims (util/meetings/linkedSchedules.ts's claimedDaysFor). The family's schedules have to be
   * disjoint: Zoom holds them as ONE union of weekdays, so a day claimed twice would silently
   * collapse into a single occurrence.
   */
  disabledDays?: string[];
  /** Smaller buttons for narrow embedding contexts (the 280px Main Calendar sidebar). */
  compact?: boolean;
  /** Rendered before the buttons; omitted for a picker that already has a caption above it. */
  label?: string;
}

// The week's seven day toggles. Shared by the meeting's own recurrence editor and the linked
// schedule's day picker, so the two can't drift in day order, labeling or behavior.
const DayPicker: React.FC<DayPickerProps> = ({
  selectedDays,
  onToggleDay,
  disabledDays = [],
  compact = false,
  label,
}) => (
  <div className={styles.dayButtons}>
    {label && <span className={styles.label}>{label}</span>}
    {WEEKDAY_NAMES.map((day, index) => (
      <CheckButton
        key={day}
        label={DAY_INITIALS[index]}
        ariaLabel={day}
        checked={selectedDays.includes(day)}
        disabled={disabledDays.includes(day)}
        onClick={() => onToggleDay(day)}
        compact={compact}
      />
    ))}
  </div>
);

export default DayPicker;

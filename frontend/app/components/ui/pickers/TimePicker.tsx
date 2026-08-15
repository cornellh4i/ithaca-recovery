import React, { useState, useEffect, useRef } from 'react';
import styles from "./TimePicker.module.scss";
import { getCurrentETMinutesSinceMidnight } from "../../../../util/date/timeUtils";

interface TimePickerProps {
  label: string | React.JSX.Element;
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  disablePast?: boolean;
  // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar sidebar).
  compact?: boolean;
  [key: string]: unknown;
}

// Adds minutes to a "HH:MM" time, wrapping across midnight. Pure clock arithmetic -- a Date's
// local getters/setters would be vulnerable to the runtime's own DST rules for no benefit,
// since this is timezone-agnostic HH:MM math to begin with.
const addMinutes = (time: string, minutesToAdd: number): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = (((hours * 60 + minutes + minutesToAdd) % 1440) + 1440) % 1440;
  const newHours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const newMinutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${newHours}:${newMinutes}`;
};

// Difference in minutes between two "HH:MM" times. Same no-Date-needed reasoning as addMinutes.
const getTimeDifferenceInMinutes = (startTime: string, endTime: string): number => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  return (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
};

const TimePicker = ({ label, value: propValue = '', disablePast, onChange, compact = false, ...props }: TimePickerProps) => {

  // Parse the initial value when component mounts
  const parseTimeRange = (value: string): { startTime: string, endTime: string } => {
    if (!value || value === '') {
      return { startTime: '', endTime: '' };
    }

    // Extract times from HH:MM - HH:MM format
    const timeMatch = value.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (timeMatch) {
      return {
        startTime: timeMatch[1],
        endTime: timeMatch[2]
      };
    }

    return { startTime: '', endTime: '' };
  };

  const initialTimeRange = parseTimeRange(propValue);
  const [startTime, setStartTime] = useState<string>(initialTimeRange.startTime);
  const [endTime, setEndTime] = useState<string>(initialTimeRange.endTime);
  const [timeDifference, setTimeDifference] = useState<number>(60); // Default difference is 60 minutes
  const [minTime, setMinTime] = useState<string | undefined>(undefined);
  // No inline validation messaging -- instead, blurring with either field empty just
  // reverts both back to the last fully-set pair (tracked here as it's typed).
  const lastValidRef = useRef(initialTimeRange);

  // Effect (not derived-during-render) deliberately: `new Date()` is impure and would
  // differ between the server-rendered HTML and the client's first render, causing a
  // hydration mismatch on the input's `min` attribute if computed inline instead.
  useEffect(() => {
    if (disablePast) {
      const minutesSinceMidnight = getCurrentETMinutesSinceMidnight();
      const hours = Math.floor(minutesSinceMidnight / 60).toString().padStart(2, '0');
      const minutes = (minutesSinceMidnight % 60).toString().padStart(2, '0');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMinTime(`${hours}:${minutes}`);
    }
  }, [disablePast]);

  useEffect(() => {
    if (startTime && endTime) {
      lastValidRef.current = { startTime, endTime };
    }
  }, [startTime, endTime]);

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartTime = e.target.value;
    setStartTime(newStartTime);

    // Calculate the new end time based on the current time difference
    const newEndTime = addMinutes(newStartTime, timeDifference);
    setEndTime(newEndTime);
    onChange(`${newStartTime} - ${newEndTime}`);
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndTime = e.target.value;
    setEndTime(newEndTime);
    setTimeDifference(getTimeDifferenceInMinutes(startTime, newEndTime));
    onChange(`${startTime} - ${newEndTime}`);
  };

  const handleBlur = () => {
    if (!startTime || !endTime) {
      const { startTime: lastStart, endTime: lastEnd } = lastValidRef.current;
      setStartTime(lastStart);
      setEndTime(lastEnd);
      onChange(`${lastStart} - ${lastEnd}`);
    }
  };

  return (
    <div className={`${styles['time-picker-wrapper']} ${compact ? styles.compact : ''}`}>
      <label className={styles['time-picker-label']}>
        {typeof label === 'string' ? <span>{label}</span> : label}
      </label>
      <input
        type="time"
        value={startTime}
        min={disablePast ? minTime : undefined}
        onChange={handleStartTimeChange}
        onBlur={handleBlur}
        className={styles['time-picker-input']}
        {...props}
      />
      <span className={styles['time-range-separator']}> - </span>
      <input
        type="time"
        value={endTime}
        onChange={handleEndTimeChange}
        onBlur={handleBlur}
        className={styles['time-picker-input']}
        {...props}
      />
    </div>
  );
};

export default TimePicker;
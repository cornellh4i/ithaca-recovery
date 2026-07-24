import React, { useState, useEffect, useRef } from 'react';
import styles from "../../../styles/components/atoms/TimePicker.module.scss";

interface TimePickerProps {
  label: string | React.JSX.Element;
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  disablePast?: boolean;
  [key: string]: unknown;
}

// Utility function to add minutes to a given time
const addMinutes = (time: string, minutesToAdd: number): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  date.setMinutes(date.getMinutes() + minutesToAdd);
  const newHours = date.getHours().toString().padStart(2, '0');
  const newMinutes = date.getMinutes().toString().padStart(2, '0');
  return `${newHours}:${newMinutes}`;
};

// Utility function to calculate the difference in minutes between two times
const getTimeDifferenceInMinutes = (startTime: string, endTime: string): number => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  const startDate = new Date(1970, 0, 1, startHours, startMinutes);
  const endDate = new Date(1970, 0, 1, endHours, endMinutes);
  return (endDate.getTime() - startDate.getTime()) / (1000 * 60);
};

const TimePicker = ({ label, value: propValue = '', disablePast, onChange, ...props }: TimePickerProps) => {

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
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
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
    <div className={styles['time-picker-wrapper']}>
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
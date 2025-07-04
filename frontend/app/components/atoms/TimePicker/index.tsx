import React, { useState, useEffect } from 'react';
import styles from "../../../../styles/components/atoms/TimePicker.module.scss";

interface TimePickerProps {
  label: string | JSX.Element;
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  error?: string;
  disablePast?: boolean;
  [key: string]: any;
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

const TimePicker = ({ label, value: propValue = '', disablePast, onChange, error, ...props }: TimePickerProps) => {
  
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
  const [endTimeError, setEndTimeError] = useState<boolean>(false); // Track if there's an end time error
  const [touched, setTouched] = useState<boolean>(false);

  // Effect to disable past times
  useEffect(() => {
    if (disablePast) {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setMinTime(`${hours}:${minutes}`);
    }
  }, [disablePast]);

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    const newStartTime = e.target.value;
    setStartTime(newStartTime);

    // Calculate the new end time based on the current time difference
    const newEndTime = addMinutes(newStartTime, timeDifference);
    setEndTime(newEndTime);
    onChange && onChange(`${newStartTime} - ${newEndTime}`);
    setEndTimeError(false); // Reset error state when start time changes
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    const newEndTime = e.target.value;
    setEndTime(newEndTime);

    // Validate end time against start time
    const newTimeDifference = getTimeDifferenceInMinutes(startTime, newEndTime);
    if (newTimeDifference <= 0) {
      setEndTimeError(true); // Set error state if end time is not later than start time
    } else {
      setEndTimeError(false); // Clear error state if valid
    }
    setTimeDifference(newTimeDifference); // Update the time difference based on user input
    onChange && onChange(`${startTime} - ${newEndTime}`);
  };

  const handleBlur = () => {
    setTouched(true);
  };

  const requiredError = touched && error && (!startTime || !endTime);

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
        className={`${styles['time-picker-input']} ${endTimeError ? styles['error-input'] : ''}`} // Apply error class conditionally
        {...props}
      />
      {endTimeError && <div className={styles['error-message']}>End time must be later than start time.</div>}
      {requiredError && <div className={styles['error-message']}>{error}</div>}
    </div>
  );
};

export default TimePicker;
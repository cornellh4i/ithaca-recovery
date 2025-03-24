import React, { useState, useEffect } from 'react';
import styles from "../../../../styles/components/atoms/TimePicker.module.scss";

interface TimePickerProps {
  label: string | JSX.Element;
  value?: string;
  onChange: (value: string, hasError?: boolean) => void;
  onErrorChange?: (hasError: boolean) => void;
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

const TimePicker = ({ label, value: propValue = '', disablePast, onChange, onErrorChange, error, ...props }: TimePickerProps) => {
  const [startTime, setStartTime] = useState<string>(''); // Start time in 24-hour format
  const [endTime, setEndTime] = useState<string>(''); // End time in 24-hour format
  const [timeDifference, setTimeDifference] = useState<number>(60); // Default difference is 60 minutes
  const [minTime, setMinTime] = useState<string | undefined>(undefined);
  
  // Replace individual error states with a single timeError state and message
  const [timeError, setTimeError] = useState<boolean>(false);
  const [endTimeSequenceError, setEndTimeSequenceError] = useState<boolean>(false);
  
  // Track which input has the error styling
  const [startTimeErrorStyle, setStartTimeErrorStyle] = useState<boolean>(false);
  const [endTimeErrorStyle, setEndTimeErrorStyle] = useState<boolean>(false);

  // Report error state to parent when error states change
  useEffect(() => {
    const hasError = timeError || endTimeSequenceError;
    onErrorChange && onErrorChange(hasError);
  }, [timeError, endTimeSequenceError, onErrorChange]);

  // Effect to disable past times
  useEffect(() => {
    if (disablePast) {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setMinTime(`${hours}:${minutes}`);
    }
  }, [disablePast]);

  // Handle change for start time
  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartTime = e.target.value;
    setStartTime(newStartTime);

    // Calculate the new end time based on the current time difference
    const newEndTime = addMinutes(newStartTime, timeDifference);
    setEndTime(newEndTime);
    
    // Reset error states when start time changes
    setStartTimeErrorStyle(false);
    if (newStartTime) {
      setTimeError(false);
    }
    
    // Check end time sequence error
    let hasSequenceError = false;
    if (endTime && getTimeDifferenceInMinutes(newStartTime, endTime) <= 0) {
      setEndTimeSequenceError(true);
      hasSequenceError = true;
    } else {
      setEndTimeSequenceError(false);
    }
    
    // Call onChange with error status
    const hasError = !newStartTime || !endTime || hasSequenceError;
    onChange && onChange(`${newStartTime} - ${newEndTime}`, hasError);
  };

  // Handle change for end time
  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndTime = e.target.value;
    setEndTime(newEndTime);

    // Validate end time against start time
    let hasSequenceError = false;
    if (startTime && newEndTime) {
      const newTimeDifference = getTimeDifferenceInMinutes(startTime, newEndTime);
      if (newTimeDifference <= 0) {
        setEndTimeSequenceError(true);
        hasSequenceError = true;
      } else {
        setEndTimeSequenceError(false);
        setTimeDifference(newTimeDifference);
      }
    }
    
    // Reset error states when end time changes
    setEndTimeErrorStyle(false);
    if (newEndTime) {
      setTimeError(false);
    }
    
    // Call onChange with error status
    const hasError = !startTime || !newEndTime || hasSequenceError;
    onChange && onChange(`${startTime} - ${newEndTime}`, hasError);
  };

  const handleStartTimeBlur = () => {
    if (!startTime) {
      setStartTimeErrorStyle(true);
      if (!timeError && !endTime) {
        setTimeError(true);
      }
      
      // Report error on blur
      onChange && onChange(`${startTime} - ${endTime}`, true);
    }
  };

  const handleEndTimeBlur = () => {
    if (!endTime) {
      setEndTimeErrorStyle(true);
      if (!timeError && !startTime) {
        setTimeError(true);
      }
      
      // Report error on blur
      onChange && onChange(`${startTime} - ${endTime}`, true);
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
        onBlur={handleStartTimeBlur}
        className={`${styles['time-picker-input']} ${startTimeErrorStyle ? styles['error-input'] : ''}`}
        {...props}
      />
      <span className={styles['time-range-separator']}> - </span>
      <input
        type="time"
        value={endTime}
        onChange={handleEndTimeChange}
        onBlur={handleEndTimeBlur}
        className={`${styles['time-picker-input']} ${endTimeErrorStyle ? styles['error-input'] : ''}`}
        {...props}
      />
      {timeError && <div className={styles['error-message']}>Time is required.</div>}
      {endTimeSequenceError && <div className={styles['error-message']}>End time must be later than start time.</div>}
      {error && <div className={styles['error-message']}>{error}</div>}
    </div>
  );
};

export default TimePicker;
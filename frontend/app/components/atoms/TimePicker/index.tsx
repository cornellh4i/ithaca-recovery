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
  const [startTime, setStartTime] = useState<string>(''); // Initially empty
  const [endTime, setEndTime] = useState<string>(''); // Initially empty
  const [timeDifference, setTimeDifference] = useState<number>(60); // Default difference is 60 minutes
  const [minTime, setMinTime] = useState<string | undefined>(undefined);

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
    // Calculate the new end time based on the original time difference
    if (startTime && endTime) {
      const newEndTime = addMinutes(newStartTime, timeDifference);
      setEndTime(newEndTime);
      onChange && onChange(`${newStartTime} - ${newEndTime}`);
    } else if (/^\d{2}:\d{2}$/.test(newStartTime) && !endTime) {
      // If it's the first time setting the start time, set the end time to one hour later
      const newEndTime = addMinutes(newStartTime, 60);
      setEndTime(newEndTime);
      setTimeDifference(60); // Set default time difference to 60 minutes
      onChange && onChange(`${newStartTime} - ${newEndTime}`);
    }
  };

  // Handle change for end time
  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndTime = e.target.value;

    // Allow the value "1" explicitly without performing further validation
    if (newEndTime === "1" || newEndTime === "01") {
      setEndTime(newEndTime);
      return;
    }

    // Allow temporary setting of the new end time for user input
    setEndTime(newEndTime);

    // Validate only if the new end time format is a complete HH:mm
    if (/^\d{2}:\d{2}$/.test(newEndTime)) {
      const [endHour, endMinute] = newEndTime.split(':').map(Number);
      const [startHour, startMinute] = startTime.split(':').map(Number);

      // Check if the new end time is strictly later than the start time
      if (
        (endHour === 1 || endHour > startHour) ||
        (endHour === startHour && endMinute > startMinute)
      ) {
        // Update the state and trigger the onChange event if valid
        onChange && onChange(`${startTime} - ${newEndTime}`);
      } else {
        // Revert to the previous valid state
        setEndTime(endTime);
      }
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
        className={styles['time-picker-input']}
        {...props}
      />
      <span className={styles['time-range-separator']}> - </span>
      <input
        type="time"
        value={endTime}
        onChange={handleEndTimeChange}
        className={styles['time-picker-input']}
        {...props}
      />
      {error && <div className={styles['error-message']}>{error}</div>}
    </div>
  );
};

export default TimePicker;

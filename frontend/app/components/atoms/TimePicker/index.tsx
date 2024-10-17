import React, { useState, useEffect } from 'react';
import styles from "../../../../styles/components/atoms/TimePicker.module.scss";


// export default TimePicker;
interface TimePickerProps {
  label: string | JSX.Element;
  value?: string;
  error?: string;
  disablePast?: boolean;
  [key: string]: any;
}

const TimePicker = ({ label, value: propValue = '', error, disablePast, ...props }: TimePickerProps) => {
  const [startTime, setStartTime] = useState<string>(''); // For start time
  const [endTime, setEndTime] = useState<string>(''); // For end time
  const [minTime, setMinTime] = useState<string | undefined>(undefined); // For disabling past times

  // Parse the propValue into start and end times when component mounts or propValue changes
  useEffect(() => {
    const [start, end] = propValue.split(' - '); // Assuming the propValue is in format "start - end"
    setStartTime(start || ''); // If no start, set as empty string
    setEndTime(end || ''); // If no end, set as empty string
  }, [propValue]);

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
    const updatedValue = `${newStartTime} - ${endTime}`;
    props.onChange && props.onChange(updatedValue); // Call onChange with updated value
  };

  // Handle change for end time
  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndTime = e.target.value;
    setEndTime(newEndTime);
    const updatedValue = `${startTime} - ${newEndTime}`;
    props.onChange && props.onChange(updatedValue); // Call onChange with updated value
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
        {...props} // Spread any additional props
      />
      <span className={styles['time-range-separator']}> - </span> {/* Separator between start and end */}
      <input
        type="time"
        value={endTime}
        min={startTime} // Ensure the end time is after the start time
        onChange={handleEndTimeChange}
        className={styles['time-picker-input']}
        {...props} // Spread any additional props
      />
      {error && <div className={styles['error-message']}>{error}</div>}
    </div>
  );
};

export default TimePicker;
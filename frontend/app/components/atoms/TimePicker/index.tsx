import React, { useEffect, useState } from 'react';
import styles from './TimePicker.module.css';

interface TimePickerProps {
  label: string | JSX.Element;
  value?: string;
  error?: string;
  disablePast?: boolean;
  [key: string]: any;
}

const TimePicker = ({ label, value, error, disablePast, ...props }: TimePickerProps) => {
  const [minTime, setMinTime] = useState<string | undefined>(undefined);

  // Log error to console if present
  if (error) {
    console.log(`TimePicker Error: ${error}`);
  }

  // Effect to disable past times if disablePast is true
  useEffect(() => {
    if (disablePast) {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setMinTime(`${hours}:${minutes}`);
    }
  }, [disablePast]);

  return (
    <div className="time-picker-wrapper">
      {/* Render the label */}
      <label className="time-picker-label">
        {typeof label === 'string' ? <span>{label}</span> : label}
      </label>

      {/* Input for time selection */}
      <input
        type="time"
        value={value}
        min={disablePast ? minTime : undefined}  // Set min time to current time if disablePast is true
        className="time-picker-input"
        {...props}  // Spread additional props to the input
      />
    </div>
  );
};

export default TimePicker;

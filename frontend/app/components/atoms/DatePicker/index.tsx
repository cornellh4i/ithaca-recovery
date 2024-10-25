import React, { useState, useEffect } from 'react';
import styles from "../../../../styles/components/atoms/DatePicker.module.scss";

interface DatePickerProps {
  label: string | JSX.Element;
  value?: string;
  error?: string;
  [key: string]: any;
}

const DatePicker = ({ label, value: propValue = '', error, ...props }: DatePickerProps) => {
  const [value, setValue] = useState<string>(propValue);

  useEffect(() => {
    if (propValue !== value) {
      setValue(propValue);
    }
  }, [propValue]);

  return (
    <div className={styles['date-picker-wrapper']}>
      <label className={styles['date-picker-label']}>
        {typeof label === 'string' ? <span>{label}</span> : label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={styles['date-picker-input']}
        {...props}
      />
      {error && <div className={styles['error-message']}>{error}</div>}
    </div>
  );
};

export default DatePicker;

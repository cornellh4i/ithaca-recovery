import React, { useState, useEffect } from 'react';
import styles from "../../../../styles/components/atoms/DatePicker.module.scss";

interface DatePickerProps {
  label: string | JSX.Element;
  value?: string; // Expect value to be in 'MM/DD/YYYY' format
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  [key: string]: any;
}

const DatePicker = ({ label, value: propValue = '', onChange, underlineOnFocus = true, ...props }: DatePickerProps) => {
  const [internalValue, setInternalValue] = useState<string>(propValue);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);


  const isValidDate = (dateString: string): boolean => {
    const regex = /^(1[0-2]|0?[1-9])\/([1-2][0-9]|3[01]|0?[1-9])\/(\d{4})$/;
    if (!regex.test(dateString)) return false;

    const [month, day, year] = dateString.split('/').map(Number);
    if (month < 1 || month > 12) return false;

    const daysInMonth = [31, (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= daysInMonth[month - 1];
  };

  const formatDate = (dateString: string): string => {
    const [month, day, year] = dateString.split('/').map(Number);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${monthNames[month - 1]} ${day}, ${year}`;
  };

  useEffect(() => {
    if (propValue !== internalValue) {
      setInternalValue(propValue);
    }
  }, [propValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    setInputError(null); // Clear error on input change
  };

  const handleFocus = () => {
    setIsFocused(true);
    setInputError(null); // Clear error on focus
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (isValidDate(internalValue)) {
      const formattedDate = formatDate(internalValue);
      setInternalValue(formattedDate); // Format and update input with formatted date
      onChange(formattedDate); // Call onChange with the formatted date
    } else {
      setInputError('Invalid date format. Please enter a valid date in MM/DD/YYYY format.');
    }
  };

  return (
    <div className={`${styles['date-picker-wrapper']} ${isFocused && underlineOnFocus ? styles['underline'] : ''}`}>
      <label className={styles['date-picker-label']}>
        {typeof label === 'string' ? <span>{label}</span> : label}
      </label>
      <input
        type="text"
        value={internalValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="MM/DD/YYYY"
        className={`${styles['date-picker-input']} ${inputError ? styles['error-input'] : ''}`} // Apply error class conditionally
        {...props}
      />
      {inputError && (
        <div className={styles['error-message']}>
          {inputError}
        </div>
      )}
    </div>
  );
};

export default DatePicker;

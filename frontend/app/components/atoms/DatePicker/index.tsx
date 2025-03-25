import React, { useState, useEffect, useRef } from 'react';
import styles from "../../../../styles/components/atoms/DatePicker.module.scss";
import MiniCalendar from '../MiniCalendar'; // Adjust import path as needed

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
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

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

  // Convert from a string to a Date object for the calendar
  const stringToDate = (dateString: string): Date => {
    // If it's a formatted date (e.g., "January 1, 2023")
    if (dateString.includes(",")) {
      return new Date(dateString);
    }
    
    // If it's in MM/DD/YYYY format
    const regex = /^(1[0-2]|0?[1-9])\/([1-2][0-9]|3[01]|0?[1-9])\/(\d{4})$/;
    if (regex.test(dateString)) {
      const [month, day, year] = dateString.split('/').map(Number);
      return new Date(year, month - 1, day);
    }
    
    // Default to today if invalid or empty
    return new Date();
  };

  useEffect(() => {
    if (propValue !== internalValue) {
      setInternalValue(propValue);
    }
  }, [propValue]);

  useEffect(() => {
    // Handle clicks outside of the date picker to close the calendar
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    setInputError(null); // Clear error on input change
  };

  const handleFocus = () => {
    setIsFocused(true);
    setInputError(null); // Clear error on focus
    setShowCalendar(true); 
  };

  const handleBlur = () => {
    setShowCalendar(false);
    setIsFocused(false);

    if (internalValue.includes(',')) {
      return;
    }
    
    if (isValidDate(internalValue)) {
      const formattedDate = formatDate(internalValue);
      setInternalValue(formattedDate); // Format and update input with formatted date
      onChange(formattedDate); // Call onChange with the formatted date
    } else {
      setInputError('Invalid date format. Please enter a valid date in MM/DD/YYYY format.');
    }
  };

  const handleDateSelect = (date: Date) => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const dateString = `${month}/${day}/${year}`;
  
  // Format the date immediately
  const formattedDate = formatDate(dateString);
  setInternalValue(formattedDate);
  
  // Notify parent component
  onChange(formattedDate);
  
};

  return (
    <div className={`${styles['date-picker-wrapper']} ${isFocused && underlineOnFocus ? styles['underline'] : ''}`} ref={datePickerRef}>
      <label className={styles['date-picker-label']}>
        {typeof label === 'string' ? <span>{label}</span> : label}
      </label>
      <div className={styles['date-picker-input-container']}>
        <input
          type="text"
          value={internalValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="MM/DD/YYYY"
          className={`${styles['date-picker-input']} ${inputError ? styles['error-input'] : ''}`}
          {...props}
        />
        {showCalendar && (
          <div 
            className={styles['calendar-popup']}
            onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking calendar
          >
            <MiniCalendar 
              selectedDate={stringToDate(internalValue)}
              onSelect={handleDateSelect}
            />
          </div>
        )}
      </div>
      {inputError && (
        <div className={styles['error-message']}>
          {inputError}
        </div>
      )}
    </div>
  );
};

export default DatePicker;

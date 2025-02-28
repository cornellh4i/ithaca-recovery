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

  const stringToDate = (dateString: string): string => {
    const currentYear = new Date().getFullYear();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
    const getMonthIndex = (month: string): number => {
      let monthIndex = monthNames.indexOf(month);
      if (monthIndex === -1) {
        monthIndex = monthAbbr.indexOf(month);
      }
      return monthIndex;
    };
  
    // "Month day, Year" or "Month day Year" -> MM/DD/YYYY
    const matchFullDate = dateString.match(/([a-zA-Z]+)\s(\d{1,2})\s*,?\s*(\d{4})/);
    if (matchFullDate) {
      const month = matchFullDate[1];
      const day = matchFullDate[2];
      const year = matchFullDate[3];
      const monthIndex = getMonthIndex(month);
      
      return `${monthNames[monthIndex]} ${Number(day)}, ${Number(year)}`;
    }
  
    // "Month day" -> MM/DD/YYYY
    const matchMonthDay = dateString.match(/([a-zA-Z]+)\s(\d{1,2})/);
    if (matchMonthDay) {
      const month = matchMonthDay[1];
      const day = matchMonthDay[2];
      const monthIndex = getMonthIndex(month);

      return `${monthNames[monthIndex]} ${Number(day)}, ${currentYear}`;
    }
  
    // MM/DD -> MM/DD/YYYY
    const matchMMDD = dateString.match(/(\d{2})\/(\d{2})/);
    if (matchMMDD) {
      const month = matchMMDD[1];
      const day = matchMMDD[2];
      return `${Number(month)}/${Number(day)}/${currentYear}`;
    }

    return "";
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

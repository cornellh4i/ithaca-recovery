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


  /**
   * isDateFormat1 is a function that returns whether the provided string is in  MM/DD/YYYY format
   * @param dateString is a string representing a date in some form
   * @returns True if dateString is a string in the form of MM/DD/YYYY
   */
  const isDateFormat1 = (dateString: string): boolean => {
    const regex = /^(1[0-2]|0?[1-9])\/([1-2][0-9]|3[01]|0?[1-9])\/(\d{4})$/;
    if (!regex.test(dateString)) return false;

    const [month, day, year] = dateString.split('/').map(Number);
    if (month < 1 || month > 12) return false;

    const daysInMonth = [31, (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= daysInMonth[month - 1];
  };

  /**
   * isDateFormat2 is a function that returns whether the provided string is in "Month day, Year", "Month day Year", "Month day", or MM/DD format
   * @param dateString is a string representing a date in some form
   * @returns True if dateString is a string in the form of either "Month day, Year", "Month day Year", "Month day", or MM/DD
   */
  const isDateFormat2 = (dateString: string): boolean => {
    const regex1 = /([a-zA-Z]+)\s(\d{1,2})\s*,?\s*(\d{4})/
    const regex2 = /([a-zA-Z]+)\s(\d{1,2})/
    const regex3 = /(\d{2})\/(\d{2})/
    return (regex1.test(dateString) || regex2.test(dateString) || regex3.test(dateString));
  };

  const formatDate = (dateString: string): string => {
    const [month, day, year] = dateString.split('/').map(Number);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${monthNames[month - 1]} ${day}, ${year}`;
  };

  /**
 * stringToDate translates a given string text to MM/DD/YYYY form. If the year is not specified, the current year is used.
 * @param dateString is a string in the form of either "Month day, Year", "Month day Year", "Month day", or MM/DD
 * @returns string in the form of MM/DD/YYYY
 */

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
      
      return `${(monthIndex + 1).toString().padStart(2, '0')}/${Number(day).toString().padStart(2, '0')}/${Number(year)}`;

    }
  
    // "Month day" -> MM/DD/YYYY
    const matchMonthDay = dateString.match(/([a-zA-Z]+)\s(\d{1,2})/);
    if (matchMonthDay) {
      const month = matchMonthDay[1];
      const day = matchMonthDay[2];
      const monthIndex = getMonthIndex(month);

      return `${(monthIndex + 1).toString().padStart(2, '0')}/${Number(day).toString().padStart(2, '0')}/${currentYear}`;
    }
  
    // MM/DD -> MM/DD/YYYY
    const matchMMDD = dateString.match(/(\d{2})\/(\d{2})/);
    if (matchMMDD) {
      const month = matchMMDD[1];
      const day = matchMMDD[2];
      return `${Number(month).toString().padStart(2, '0')}/${Number(day).toString().padStart(2, '0')}/${currentYear}`;
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
    if (isDateFormat2(internalValue)) {
      console.log(internalValue)
      console.log("this is" + stringToDate(internalValue))
      const formattedDate = stringToDate(internalValue);
      setInternalValue(formattedDate); 
      onChange(formattedDate); 
    } else {
      setInputError('Invalid date format. Please enter a valid date in MM/DD/YYYY format.');
    }

    setInputError(null); // Clear error on focus
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (isDateFormat1(internalValue)) {
      const formattedDate = formatDate(internalValue);
      setInternalValue(formattedDate); // Format and update input with formatted date
      onChange(formattedDate); // Call onChange with the formatted date
    } else if (isDateFormat2(internalValue)) {
      const formattedDate = stringToDate(internalValue);
      setInternalValue(formattedDate); 
      onChange(formattedDate); 
    }
    else {
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

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from "./DatePicker.module.scss";
import MiniCalendar from '../../calendar/MiniCalendar'; // Adjust import path as needed

interface DatePickerProps {
  label: string | React.JSX.Element;
  value?: string; // Expect value to be in 'MM/DD/YYYY' format
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar sidebar).
  compact?: boolean;
  [key: string]: unknown;
}

const DatePicker = ({ label, value: propValue = '', onChange, underlineOnFocus = true, compact = false, ...props }: DatePickerProps) => {
  const [internalValue, setInternalValue] = useState<string>(propValue);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  // Popup is portaled to document.body (see render below) so an ancestor's overflow:auto
  // (e.g. the Main Calendar sidebar) can't clip or mis-stack it -- position is computed
  // from the field's own on-screen location instead of relying on CSS anchoring. Since the
  // portaled popup is no longer a DOM descendant of datePickerRef, the outside-click check
  // below needs its own ref to still recognize clicks inside the popup as "not outside".
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);

  // Mirrors an external propValue reset (e.g. parent clearing the form) into local state
  // without an Effect — https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  // Still allows free local typing between resets, unlike making this a controlled input.
  const [prevPropValue, setPrevPropValue] = useState(propValue);
  if (propValue !== prevPropValue) {
    setPrevPropValue(propValue);
    setInternalValue(propValue);
  }


  /**
   * isDateMMDDYYYY is a function that returns whether the provided string is in  MM/DD/YYYY format
   * @param dateString is a string representing a date in some form
   * @returns True if dateString is a string in the form of MM/DD/YYYY
   */
  const isDateMMDDYYYY = (dateString: string): boolean => {
    const regex = /^(1[0-2]|0?[1-9])\/([1-2][0-9]|3[01]|0?[1-9])\/(\d{4})$/;
    if (!regex.test(dateString)) return false;

    const [month, day, year] = dateString.split('/').map(Number);
    if (month < 1 || month > 12) return false;

    const daysInMonth = [31, (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= daysInMonth[month - 1];
  };

  /**
   * isStringDate is a function that returns whether the provided string is in "Month day, Year", "Month day Year", "Month day", or MM/DD format
   * @param dateString is a string representing a date in some form
   * @returns True if dateString is a string in the form of either "Month day, Year", "Month day Year", "Month day", or MM/DD
   */
  const isStringDate = (dateString: string): boolean => {
    const regex1 = /([a-zA-Z]+)\s(\d{1,2})\s*,?\s*(\d{4})/
    const regex2 = /([a-zA-Z]+)\s(\d{1,2})/
    const regex3 = /(\d{2})\/(\d{2})/
    return (regex1.test(dateString) || regex2.test(dateString) || regex3.test(dateString));
  };

  const formatDate = (dateString: string): string => {
    const [month, day, year] = dateString.split('/').map(Number);
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  };

  /**
   * stringToDate translates a given string to Date object.
   * @param dateString is a string in the form "MM/DD/YYYY"
   * @returns dateString in Date form
   */
  const stringToDate = (dateString: string): Date => {
    // TODO: Validate that this is compatible with timezone fix
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

  /**
 * stringToDateString translates a given string text to MM/DD/YYYY form. If the year is not specified, the current year is used.
 * @param dateString is a string in the form of either "Month day, Year", "Month day Year", "Month day", or MM/DD
 * @returns string in the form of MM/DD/YYYY
 */

  const stringToDateString = (dateString: string): string => {
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
    // Handle clicks outside of the date picker to close the calendar
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideField = datePickerRef.current?.contains(target);
      const insidePopup = popupRef.current?.contains(target);
      if (!insideField && !insidePopup) {
        setShowCalendar(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Tracks the field's on-screen position while the popup is open, so the portaled
  // popup (position:fixed) stays anchored under it -- recomputed on scroll (capture:true
  // catches scrolling within any nested scroll container, not just the window) and resize.
  useEffect(() => {
    if (!showCalendar) return;

    const updatePosition = () => {
      const rect = datePickerRef.current?.getBoundingClientRect();
      if (rect) {
        setPopupPosition({ top: rect.bottom + 8, left: rect.left });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showCalendar]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(e.target.value);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setShowCalendar(true);
  };

  const handleBlur = () => {
    setShowCalendar(false);
    setIsFocused(false);
    if (isDateMMDDYYYY(internalValue)) {
      // internalValue is already valid MM/DD/YYYY here — notify the parent with
      // that (the format callers expect, per this component's own `value` doc
      // comment), and only use the spelled-out formatDate() output for display.
      const formattedDate = formatDate(internalValue);
      onChange(internalValue);
      setInternalValue(formattedDate); // Format and update input with formatted date
    } else if (isStringDate(internalValue)) {
      const formattedDate = stringToDateString(internalValue);
      setInternalValue(formattedDate);
      onChange(formattedDate);
    } else {
      // Empty or unparseable -- no inline error, just revert the display back to
      // the last value the parent actually committed.
      setInternalValue(propValue);
    }
  };

  const handleDateSelect = (date: Date) => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const dateString = `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;

  // Format the date for display, but notify the parent with the MM/DD/YYYY
  // form (per this component's own `value` doc comment) — same split as
  // handleBlur, for the same reason.
  const formattedDate = formatDate(dateString);
  setInternalValue(formattedDate);
  onChange(dateString);
};

  return (
    <div className={`${styles['date-picker-wrapper']} ${compact ? styles.compact : ''} ${isFocused && underlineOnFocus ? styles['underline'] : ''}`} ref={datePickerRef}>
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
          className={styles['date-picker-input']}
          {...props}
        />
        {showCalendar && popupPosition && createPortal(
          <div
            ref={popupRef}
            className={styles['calendar-popup']}
            style={{ top: popupPosition.top, left: popupPosition.left }}
            onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking calendar
            // Portaled to document.body, so it's a DOM sibling of wherever DatePicker itself
            // is mounted, not a descendant -- a parent (e.g. ViewMeeting.tsx) with its own
            // "click outside closes me" listener has no other way to recognize a click here as
            // still "inside". CSS Modules hashes styles['calendar-popup'] per-file, so that
            // class name isn't a reliable cross-component hook; this data attribute is.
            data-datepicker-popup="true"
          >
            <MiniCalendar
              selectedDate={stringToDate(internalValue)}
              onSelect={handleDateSelect}
            />
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};

export default DatePicker;

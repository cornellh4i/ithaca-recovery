// // import React, { useState, useEffect } from 'react';
// // import styles from "../../../../styles/components/atoms/DatePicker.module.scss";

// // interface DatePickerProps {
// //   label: string | JSX.Element;
// //   value?: string; // Expect value to be in 'YYYY-MM-DD' format for proper parsing
// //   onChange: (value: string) => void;
// //   underlineOnFocus?: boolean;
// //   error?: string;
// //   [key: string]: any;
// // }

// // const DatePicker = ({ label, value: propValue = '', error, onChange, underlineOnFocus = true, ...props }: DatePickerProps) => {
// //   const [internalValue, setInternalValue] = useState<string>(propValue);
// //   const [isFocused, setIsFocused] = useState<boolean>(false);
// //   const [displayValue, setDisplayValue] = useState<string>(propValue); // Store formatted display value

// //   // Format the date for display
// //   const formatDate = (dateString: string): string => {
// //     const date = new Date(dateString);
// //     if (!isNaN(date.getTime())) {
// //       const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
// //       return date.toLocaleDateString(undefined, options); // Format as "Month Day, Year"
// //     }
// //     return dateString; // Return original string if it's invalid
// //   };

// //   // Update internal value and display value when propValue changes
// //   useEffect(() => {
// //     if (propValue !== internalValue) {
// //       setInternalValue(propValue);
// //       setDisplayValue(formatDate(propValue)); // Update display value when propValue changes
// //     }
// //   }, [propValue]);

// //   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// //     const newValue = e.target.value;
// //     setInternalValue(newValue);
// //     onChange(newValue); // Call onChange with the new input value
// //   };

// //   const handleFocus = () => {
// //     setIsFocused(true);
// //     setInternalValue(propValue); // Reset input to the original value for editing
// //   };

// //   const handleBlur = () => {
// //     setIsFocused(false);
// //     const formattedDate = formatDate(internalValue); // Format date when losing focus
// //     setDisplayValue(formattedDate); // Set display value to formatted date
// //     onChange(internalValue); // Keep internal value for prop
// //   };

// //   return (
// //     <div className={`${styles['date-picker-wrapper']} ${isFocused && underlineOnFocus ? styles['underline'] : ''}`}>
// //       <label className={styles['date-picker-label']}>
// //         {typeof label === 'string' ? <span>{label}</span> : label}
// //       </label>
// //       <input
// //         type="text" // Changed to text to allow custom formatting
// //         value={isFocused ? internalValue : displayValue} // Show internalValue on focus, else displayValue
// //         onChange={handleChange}
// //         onFocus={handleFocus}
// //         onBlur={handleBlur}
// //         placeholder="MM/DD/YYYY" // Optional placeholder
// //         className={styles['date-picker-input']}
// //         {...props} // Spread the rest of the props
// //       />
// //       {error && <div className={styles['error-message']}>{error}</div>}
// //     </div>
// //   );
// // };

// // export default DatePicker;

// import React, { useState, useEffect } from 'react';
// import styles from "../../../../styles/components/atoms/DatePicker.module.scss";

// interface DatePickerProps {
//   label: string | JSX.Element;
//   value?: string; // Expect value to be in 'YYYY-MM-DD' format for proper parsing
//   onChange: (value: string) => void;
//   underlineOnFocus?: boolean;
//   error?: string;
//   [key: string]: any;
// }

// const DatePicker = ({ label, value: propValue = '', error, onChange, underlineOnFocus = true, ...props }: DatePickerProps) => {
//   const [internalValue, setInternalValue] = useState<string>(propValue);
//   const [isFocused, setIsFocused] = useState<boolean>(false);
//   const [displayValue, setDisplayValue] = useState<string>(propValue);
//   const [inputError, setInputError] = useState<string | null>(null); // State for input error message

//   const isValidDate = (dateString: string): boolean => {
//     const regex = /^(1[0-2]|0?[1-9])\/([1-2][0-9]|3[01]|0?[1-9])\/(\d{1,4})$/;
//     if (!regex.test(dateString)) {
//       return false;
//     }

//     const [month, day, year] = dateString.split('/').map(Number);
//     if (month < 1 || month > 12) return false;

//     const daysInMonth = [31, (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
//     return day >= 1 && day <= daysInMonth[month - 1];
//   };

//   const formatDate = (dateString: string): string => {
//     const [month, day, year] = dateString.split('/').map(Number);
//     const date = new Date(year, month - 1, day);
//     const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
//     return date.toLocaleDateString(undefined, options);
//   };

//   useEffect(() => {
//     if (propValue !== internalValue) {
//       setInternalValue(propValue);
//       setDisplayValue(formatDate(propValue));
//     }
//   }, [propValue]);

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const newValue = e.target.value;
//     setInternalValue(newValue);
//     setInputError(null); // Clear error on input change
//     onChange(newValue); // Call onChange with the new input value
//   };

//   const handleFocus = () => {
//     setIsFocused(true);
//     setInternalValue(propValue);
//     setInputError(null); // Clear error on focus
//   };

//   const handleBlur = () => {
//     setIsFocused(false);
//     if (!isValidDate(internalValue)) {
//       setInputError('Invalid date format. Please enter a valid date in MM/DD/YYYY format.');
//       setDisplayValue(internalValue); // Keep display value as is
//     } else {
//       const formattedDate = formatDate(internalValue);
//       setDisplayValue(formattedDate);
//       onChange(internalValue); // Keep internal value for prop
//     }
//   };

//   return (
//     <div className={`${styles['date-picker-wrapper']} ${isFocused && underlineOnFocus ? styles['underline'] : ''}`}>
//       <label className={styles['date-picker-label']}>
//         {typeof label === 'string' ? <span>{label}</span> : label}
//       </label>
//       <input
//         type="text"
//         value={isFocused ? internalValue : displayValue}
//         onChange={handleChange}
//         onFocus={handleFocus}
//         onBlur={handleBlur}
//         placeholder="MM/DD/YYYY"
//         className={`${styles['date-picker-input']} ${inputError ? styles['error-input'] : ''}`} // Apply error class conditionally
//         {...props}
//       />
//       {inputError && <div className={styles['error-message']}>{inputError}</div>} {/* Error message for invalid date */}
//     </div>
//   );
// };

// export default DatePicker;

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
  const [inputError, setInputError] = useState<string | null>(null); // State for input error message

  const isValidDate = (dateString: string): boolean => {
    const regex = /^(1[0-2]|0?[1-9])\/([1-2][0-9]|3[01]|0?[1-9])\/(\d{4})$/;
    if (!regex.test(dateString)) {
      return false;
    }

    const [month, day, year] = dateString.split('/').map(Number);
    if (month < 1 || month > 12) return false;

    const daysInMonth = [31, (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= daysInMonth[month - 1];
  };

  const formatDateString = (dateString: string): string => {
    const [month, day, year] = dateString.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' });
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
      const formattedDate = formatDateString(internalValue);
      setInternalValue(formattedDate);
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
      )} {/* Error message for invalid date */}
    </div>
  );
};

export default DatePicker;

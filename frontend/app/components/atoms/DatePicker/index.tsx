import React, { useState, useEffect } from 'react';
import styles from "../../../../styles/components/atoms/DatePicker.module.scss";

interface DatePickerProps {
  label: string | JSX.Element;
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  error?: string;
  [key: string]: any;
}

const DatePicker = ({ label, value: propValue = '', error, onChange, underlineOnFocus = true, ...props }: DatePickerProps) => {
  const [internalValue, setInternalValue] = useState<string>(propValue);
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (propValue !== internalValue) {
      setInternalValue(propValue);
    }
  }, [propValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange && onChange(newValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const getToday = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // Format as YYYY-MM-DD for input
  };

  // Filter out 'onChange' from props to avoid passing it twice
  const { onChange: _onChange, ...restProps } = props;

  return (
    <div className={`${styles['date-picker-wrapper']} ${isFocused && underlineOnFocus ? styles['underline'] : ''}`}>
      <label className={styles['date-picker-label']}>
        {typeof label === 'string' ? <span>{label}</span> : label}
      </label>
      <input
        type="date"
        value={internalValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={styles['date-picker-input']}
        {...restProps} // Spread the rest of the props, excluding onChange
      />
      {error && <div className={styles['error-message']}>{error}</div>}
    </div>
  );
};

export default DatePicker;


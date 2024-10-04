import React from 'react';

interface DatePickerProps {
  label: string | JSX.Element;
  value?: string;
  error?: string;
  [key: string]: any;
}

const DatePicker = ({ label, value, error, ...props }: DatePickerProps) => {
  // Log error to console if provided
  if (error) {
    console.log(`DatePicker Error: ${error}`);
  }

  return (
    <div className="date-picker-wrapper">
      {/* Render the label next to the picker */}
      <label className="date-picker-label">
        {typeof label === 'string' ? <span>{label}</span> : label}
      </label>

      {/* Input for date selection */}
      <input
        type="date"
        value={value}
        className="date-picker-input"
        {...props}  // Additional props passed into the input element
      />
    </div>
  );
};

export default DatePicker;


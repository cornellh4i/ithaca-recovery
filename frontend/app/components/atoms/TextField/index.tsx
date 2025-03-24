import React, { useState, useEffect } from "react";
import styles from "../../../../styles/components/atoms/TextField.module.scss";

interface TextFieldProps {
  input: string; // Placeholder or label text
  value?: string;
  onChange: (value: string, hasError: boolean) => void;
  onErrorChange?: (hasError: boolean) => void;
  underlineOnFocus?: boolean;
  label?: string | JSX.Element; // Label can now be either a string or an SVG element
  [key: string]: any; // Allow for additional props
}

const TextField: React.FC<TextFieldProps> = ({
  input,
  value = "",
  onChange,
  onErrorChange,
  label,
  ...props
}) => {

  const [internalValue, setInternalValue] = useState<string>(value);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const [underlineOnFocus, setUnderlineOnFocus] = useState(false);

  // Report error state to parent when it changes
  useEffect(() => {
    if (hasInteracted && onErrorChange) {
      onErrorChange(inputError !== null);
    }
  }, [inputError, hasInteracted, onErrorChange]);

  // Update internal value when prop value changes
  useEffect(() => {
    if (value !== internalValue) {
      setInternalValue(value);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    setInputError(null); // Clear error on input change
    onChange(newValue, false); // Report to parent with no error
  };
  
  const handleFocus = () => {
    setIsFocused(true);
    setUnderlineOnFocus(true);
    setHasInteracted(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setUnderlineOnFocus(false);
    
    if (internalValue.trim() === "") {
      setInputError('Please input a valid value.');
      onChange(internalValue, true); // Report to parent with error
    } else {
      onChange(internalValue, false); // Report to parent with no error
    }
  };

  // Determine font size based on label presence
  const fontSize = label == null ? "24px" : "18px";

  return (
    <div className={`${styles['textfieldcontainer']} ${isFocused && underlineOnFocus ? styles['underline'] : ''}`}>
      {label && (
        <label
          className={styles.textfieldlabel}
          style={{ fontSize: "18px" }} // Label is always 18px
        >
          {typeof label === "string" ? <span>{label}</span> : label}
        </label>
      )}
      <input
        type="text"
        value={internalValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={input}
        style={{ fontSize }}
        className={`${styles.textfieldinput} ${inputError ? styles['error-input'] : ''}`} // Apply error class conditionally
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

export default TextField;

import React, { useState } from "react";
import styles from "../../../../styles/components/atoms/TextField.module.scss";

interface TextFieldProps {
  input: string; // Placeholder or label text
  value?: string;
  onChange: (value: string) => void;
  underlineOnFocus?: boolean;
  label?: string | JSX.Element; // Label can now be either a string or an SVG element
  [key: string]: any; // Allow for additional props
}

const TextField: React.FC<TextFieldProps> = ({
  input,
  value = "",
  onChange,
  label,
  ...props
}) => {

  const [internalValue, setInternalValue] = useState<string>(value);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const [underlineOnFocus, setUnderlineOnFocus] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      setInputError(null); // Clear error on input change
    };
  
  const handleFocus = () => {
    setIsFocused(true);
    setUnderlineOnFocus(true);
    setInputError(null); // Clear error on focus
  };

  const handleBlur = () => {
    setIsFocused(false);
    setUnderlineOnFocus(false);
    if (internalValue !== "") {
      setInternalValue(internalValue); // Format and update input with formatted date
      onChange(internalValue); // Call onChange with the formatted date
    } else {
      setInputError('Please input a valid value.');
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

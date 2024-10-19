import React, { useState } from "react";
import styles from "../../../../styles/components/atoms/SpinnerInput.module.scss";

interface InputSpinnerProps {
  label?: string;
  value: number; // Default value of the spinner
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  underlineOnFocus?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
}

const SpinnerInput: React.FC<InputSpinnerProps> = ({
  label,
  min = 1,
  max,
  value,
  step = 1,
  onChange,
  underlineOnFocus = false,
  disabled = false,
  readOnly = false,
  error,
}) => {
// const [underlineOnFocus, setUnderlineOnFocus] = useState(false);
  const [value, setValue] = useState("");
  
  const handleChange = (event) => {
    setValue(event.target.value);
  };

  return (
    <div className={styles.spinnerInputContainer}>
      <input
        className={`${styles.spinnerInput} ${
          underlineOnFocus ? styles.focused : styles.default
        }`}
        type="number"
        value={value}
        placeholder={value.toString()}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
        onChange={handleChange}
      ></input>
      {error && <span className={styles.spinnerInputError}>{error}</span>}
    </div>
  );
};

export default SpinnerInput;

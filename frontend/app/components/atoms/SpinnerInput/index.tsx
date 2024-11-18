import React, { useState, useEffect } from "react";
import styles from "../../../../styles/components/atoms/SpinnerInput.module.scss";

interface InputSpinnerProps {
  label?: string;
  value: number;
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
  const [localValue, setLocalValue] = useState(value.toString());
  const [underline, setUnderline] = useState(false);

  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setLocalValue(newValue);
    onChange(parseFloat(newValue)); // Notify parent of the change
  };

  const increment = () => {
    setLocalValue((prev) => {
      const newValue = Math.min(parseFloat(prev) + step, max || Infinity);
      onChange(newValue);
      return newValue.toString();
    });
  };

  const decrement = () => {
    setLocalValue((prev) => {
      const newValue = Math.max(parseFloat(prev) - step, min || 0);
      onChange(newValue);
      return newValue.toString();
    });
  };

  const toggleFocus = () => setUnderline(true);
  const handleBlur = () => setUnderline(false);

  return (
    <div
      className={`${styles.spinnerInputContainer} ${
        underline ? styles.focused : styles.default
      }`}
    >
      {label && <label>{label}</label>}
      <input
        className={`${styles.spinnerInput} ${
          underlineOnFocus ? styles.focused : styles.default
        }`}
        onFocus={toggleFocus}
        onBlur={handleBlur}
        type="number"
        value={localValue}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
        onChange={handleChange}
        placeholder={localValue}
      />
      <div className={styles.spinnerArrows}>
        <div
          className={styles.spinnerArrow}
          onClick={increment}
          role="button"
          tabIndex={0}
          aria-label="Increment"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="6"
            height="3"
            viewBox="0 0 6 3"
            fill="none"
            style={{ transform: "rotate(180deg)" }} // Rotate for increment arrow
          >
            <path
              d="M2.63372 2.85638L0.104651 0.542553C0.0697675 0.510639 0.043721 0.47617 0.0265117 0.439149C0.00930239 0.402128 0.000465116 0.362128 0 0.319149C0 0.234043 0.032093 0.159574 0.096279 0.0957444C0.160465 0.0319147 0.244651 0 0.348837 0H5.65116C5.75581 0 5.84023 0.0319147 5.90441 0.0957444C5.9686 0.159574 6.00046 0.234043 5.99999 0.319149C5.99999 0.340426 5.96511 0.414894 5.89534 0.542553L3.36628 2.85638C3.30814 2.90957 3.25 2.94681 3.19186 2.96809C3.13372 2.98936 3.06977 3 3 3C2.93023 3 2.86628 2.98936 2.80814 2.96809C2.75 2.94681 2.69186 2.90957 2.63372 2.85638Z"
              fill="black"
            />
          </svg>
        </div>
        <div
          className={styles.spinnerArrow}
          onClick={decrement}
          role="button"
          tabIndex={0}
          aria-label="Decrement"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="6"
            height="3"
            viewBox="0 0 6 3"
            fill="none"
          >
            <path
              d="M2.63372 2.85638L0.104651 0.542553C0.0697675 0.510639 0.043721 0.47617 0.0265117 0.439149C0.00930239 0.402128 0.000465116 0.362128 0 0.319149C0 0.234043 0.032093 0.159574 0.096279 0.0957444C0.160465 0.0319147 0.244651 0 0.348837 0H5.65116C5.75581 0 5.84023 0.0319147 5.90441 0.0957444C5.9686 0.159574 6.00046 0.234043 5.99999 0.319149C5.99999 0.340426 5.96511 0.414894 5.89534 0.542553L3.36628 2.85638C3.30814 2.90957 3.25 2.94681 3.19186 2.96809C3.13372 2.98936 3.06977 3 3 3C2.93023 3 2.86628 2.98936 2.80814 2.96809C2.75 2.94681 2.69186 2.90957 2.63372 2.85638Z"
              fill="black"
            />
          </svg>
        </div>
      </div>
      {error && <span className={styles.spinnerInputError}>{error}</span>}
    </div>
  );
};

export default SpinnerInput;
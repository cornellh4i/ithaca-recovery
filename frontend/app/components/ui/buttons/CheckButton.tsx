import React from 'react';
import styles from "./CheckButton.module.scss";

interface CheckButtonProps {
  label: string;
  checked?: boolean;
  onClick: () => void;
  // Smaller diameter for narrow embedding contexts (e.g. the 280px calendar sidebar), where
  // the full-size button would get squished into an ellipse by flexbox's default shrink.
  compact?: boolean;
  disabled?: boolean;
  // Names the button for assistive tech when `label` is a single letter that only reads as a
  // day/option in context (the day picker's "S", "M", "T"...).
  ariaLabel?: string;
}

const CheckButton: React.FC<CheckButtonProps> = ({
  label,
  checked = false,
  onClick,
  compact = false,
  disabled = false,
  ariaLabel,
}) => {
  return (
    <button
      type="button"
      className={`${styles.checkButton} ${compact ? styles.compact : ''} ${checked ? styles.active : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={checked}
    >
      {label}
    </button>
  );
};

export default CheckButton;

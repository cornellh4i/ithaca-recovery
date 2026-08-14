import React from 'react';
import styles from "../../../../styles/components/ui/buttons/CheckButton.module.scss";

interface CheckButtonProps {
  label: string;
  checked?: boolean;
  onClick: () => void;
  // Smaller diameter for narrow embedding contexts (e.g. the 280px calendar sidebar), where
  // the full-size button would get squished into an ellipse by flexbox's default shrink.
  compact?: boolean;
}

const CheckButton: React.FC<CheckButtonProps> = ({ label, checked = false, onClick, compact = false }) => {
  return (
    <button
      type="button"
      className={`${styles.checkButton} ${compact ? styles.compact : ''} ${checked ? styles.active : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default CheckButton;

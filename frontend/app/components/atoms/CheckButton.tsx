import React from 'react';
import styles from "../../../styles/components/atoms/CheckButton.module.scss";

interface CheckButtonProps {
  label: string;
  checked?: boolean;
  onClick: () => void;
}

const CheckButton: React.FC<CheckButtonProps> = ({ label, checked = false, onClick }) => {
  return (
    <button
      type="button"
      className={`${styles.checkButton} ${checked ? styles.active : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default CheckButton;

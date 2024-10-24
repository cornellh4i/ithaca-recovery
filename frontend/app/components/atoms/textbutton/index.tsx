import React, { useState } from "react";
import styles from "../../../../styles/TextButton.module.scss";
import Dropdown from "../drop-down/index";

interface ButtonProps {
  label: string;              // Text to display inside the button
  onClick: () => void;        // Function to call when button is clicked
  icon?: React.ReactNode;     // Icon to be displayed within the button
}

const TextButton: React.FC<ButtonProps> = ({ onClick, label, icon }) => {

  const handleClick = async () => {
    await onClick();
  };


  return (
    <div className={styles.meetingContainer}>
        <button className={styles.btn} onClick={handleClick}>
            {icon && <span className={styles.icon}>{icon}</span>}
            {label && <span className={styles.label}>{label}</span>}
          </button>

    </div>
  );
};

export default TextButton;

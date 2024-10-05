import React, { useState } from "react";
import styles from "../../../../styles/TextButton.module.scss";
import Dropdown from "../drop-down/index";

interface ButtonProps {
  label: string;              // Text to display inside the button
  onClick: () => void;        // Function to call when button is clicked
  icon?: React.ReactNode;     // Icon to be displayed within the button
}

const TextButton: React.FC<ButtonProps> = ({ onClick, label, icon }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const handleClick = async () => {
    await onClick();
    setShowDropdown(true); // Open the dropdown on button click
  };

  const handleCloseDropdown = () => {
    setShowDropdown(false); // Close the dropdown
  };


  return (
    <div className={styles.meetingContainer}>
      <div className={styles.buttonDropdownContainer}>
        {!showDropdown ? (
          <button className={styles.btn} onClick={handleClick}>
            {icon && <span className={styles.icon}>{icon}</span>}
            {label && <span className={styles.label}>{label}</span>}
          </button>
        ) : (
          <div className={styles.dropdownHeader}>
            <p className={styles.meetingTitleText}>New Meeting</p>
            <button className={styles.closeButton} onClick={handleCloseDropdown}>
              X
            </button>
          </div>
        )}

        <Dropdown
          isVisible={showDropdown}
        />

      
      </div>
    </div>
  );
};

export default TextButton;

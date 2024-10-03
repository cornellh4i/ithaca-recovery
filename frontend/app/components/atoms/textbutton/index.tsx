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
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  
  const handleClick = async () => {
    await onClick();
    setShowDropdown(true);
  };

  const handleCloseDropdown = () => {
    setShowDropdown(false);
  };

  const handleSelectLocation = (location: string) => {
    setSelectedLocation(location);
    console.log(`Location selected: ${location}`);
  };

  return (
    <div className={styles.buttonDropdownContainer}>
      <button className={styles.btn} onClick={handleClick}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {label && <span className={styles.label}>{label}</span>}
      </button>
      {showDropdown && (
        <button className={styles.closeButton} onClick={handleCloseDropdown}>
          X
        </button>
      )}

        {selectedLocation && (
          <div>
            <p>Selected Location: {selectedLocation}</p>
          </div>
        )}
      <Dropdown isVisible={showDropdown}
          onClose={handleCloseDropdown}
          onSelectLocation={handleSelectLocation}/>
      
    </div>
  );
};

export default TextButton;

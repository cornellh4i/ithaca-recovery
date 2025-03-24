import React, { useState } from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  label: string | React.ReactNode;
  isVisible: boolean;
  elements: string[]; 
  name: string; 
  onChange: (value: string) => void;
}


const Dropdown: React.FC<DropdownProps> = ({ label, isVisible, elements, name, onChange }) => {
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null); 
  const [inputError, setInputError] = useState<string | null>(null);

  if (!isVisible) return null;

  const handleDropdownToggle = (dropdownType: string) => {
    if (activeDropdown === dropdownType) {
      if (!selectedElement) setInputError("Please select an option.");
      setActiveDropdown(null);
    } else {
      setActiveDropdown(dropdownType);
      setInputError(null); 
    }
  };

  const handleElementClick = (element: string) => {
    setSelectedElement(element);
    onChange(element);
    setActiveDropdown(null); 
    setInputError(null); // Clear error on valid selection
  };


  return (
    <div className={styles.dropdown}>
      <div className={styles.DropdownContainer}>
        <label className={styles.DropdownLabel}>
          {typeof label === 'string' ? <span>{label}</span> : label}
        </label>
        <button
          className={`${styles.DropdownButton} ${activeDropdown === "element" ? styles.activeDropdown : ''} 
            ${inputError ? styles.DropdownErrorInput : ''}`}
          onClick={() => handleDropdownToggle("element")}
        >
          {selectedElement ? selectedElement : name}
        </button>
        {activeDropdown === "element" && (
          <ul className={styles.elementList}>
            {elements.map((element, index) => (
              <li
                key={index}
                className={`${styles.dropdownItem} ${selectedElement === element ? styles.selected : ''}`}
                onClick={() => handleElementClick(element)}
              >
                {element}
              </li>
            ))}
          </ul>
        )}
        {inputError && <div className={styles.DropdownErrorMessage}>{inputError}</div>}
      </div>

    </div>
  );
};

export default Dropdown;

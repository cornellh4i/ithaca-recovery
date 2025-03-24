import React, { useState, useEffect } from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  label: string | React.ReactNode;
  isVisible: boolean;
  elements: string[]; 
  name: string; 
  onChange: (value: string, hasError: boolean) => void;
  onErrorChange?: (hasError: boolean) => void;
}

const Dropdown: React.FC<DropdownProps> = ({ 
  label, 
  isVisible, 
  elements, 
  name, 
  onChange, 
  onErrorChange 
}) => {
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null); 
  const [inputError, setInputError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);

  // Report error state to parent when it changes
  useEffect(() => {
    if (hasInteracted && onErrorChange) {
      onErrorChange(inputError !== null);
    }
  }, [inputError, hasInteracted, onErrorChange]);

  if (!isVisible) return null;

  const handleDropdownToggle = (dropdownType: string) => {
    setHasInteracted(true);

    if (activeDropdown === dropdownType) {
      if (!selectedElement) {
        setInputError("Please select an option.");
        onChange("", true); // Report empty selection with error
      }
      setActiveDropdown(null);
    } else {
      setActiveDropdown(dropdownType);
      // Don't clear error yet, only when user makes a selection
    }
  };

  const handleElementClick = (element: string) => {
    setSelectedElement(element);
    setInputError(null); // Clear error on valid selection
    onChange(element, false); // Report valid selection with no error
    setActiveDropdown(null);
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

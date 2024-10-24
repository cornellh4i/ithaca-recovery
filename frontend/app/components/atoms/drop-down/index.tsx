import React, { useState } from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  isVisible: boolean;
  elements: string[]; 
  name: string; 
}


const Dropdown: React.FC<DropdownProps> = ({ isVisible, elements, name }) => {
  const [selectedElement, setselectedElement] = useState<string | null>(null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null); 

  if (!isVisible) return null;

  const handleDropdownToggle = (dropdownType: string) => {
    setActiveDropdown((prev) => (prev === dropdownType ? null : dropdownType));
  };

  const handleElementClick = (element: string) => {
    setselectedElement(element);
    setActiveDropdown(null); 
  };


  return (
    <div className={styles.dropdown}>
      <div className={styles.DropdownContainer}>
        <button
          className={`${styles.DropdownButton} ${activeDropdown === "element" ? styles.activeDropdown : ''}`}
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
      </div>

    </div>
  );
};

export default Dropdown;

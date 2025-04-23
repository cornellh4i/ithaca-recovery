import React, { useState } from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  label: string | React.ReactNode;
  value?: string;
  isVisible: boolean;
  elements: string[]; 
  name: string; 
  onChange: (value: string) => void;
}


const Dropdown: React.FC<DropdownProps> = ({ 
  label, 
  value,
  isVisible, 
  elements, 
  name, 
  onChange,}) => {
  const [selectedElement, setselectedElement] = useState<string | null>(null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null); 

  React.useEffect(() => {
    if (value) {
      setselectedElement(value);
      onChange(value);
      setActiveDropdown(null);
    }
  }, []);

  if (!isVisible) return null;

  const handleDropdownToggle = (dropdownType: string) => {
    setActiveDropdown((prev) => (prev === dropdownType ? null : dropdownType));
  };

  const handleElementClick = (element: string) => {
    setselectedElement(element);
    onChange(element);
    setActiveDropdown(null); 
  };


  return (
    <div className={styles.dropdown}>
      <div className={styles.DropdownContainer}>
        <label className={styles.DropdownLabel}>
          {typeof label === 'string' ? <span>{label}</span> : label}
        </label>
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

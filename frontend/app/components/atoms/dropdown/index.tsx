import React, { useState, useEffect } from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  label: string | React.ReactNode;
  isVisible: boolean;
  elements: string[];
  name: string;
  onChange: (value: string) => void;
  selectedValue?: string;
}


const Dropdown: React.FC<DropdownProps> = ({ label, isVisible, elements, name, onChange, selectedValue }) => {
  const [selectedElement, setselectedElement] = useState<string | null>(selectedValue || null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (selectedValue !== undefined) {
      setselectedElement(selectedValue);
    }
  }, [selectedValue]);

  if (!isVisible) return null;

  const handleDropdownToggle = (e: React.MouseEvent, dropdownType: string) => {
    e.stopPropagation();
    setActiveDropdown((prev) => (prev === dropdownType ? null : dropdownType));
  };

  const handleElementClick = (e: React.MouseEvent, element: string) => {
    e.stopPropagation();
    setselectedElement(element);
    onChange(element);
    setActiveDropdown(null);
  };


  return (
    <div
      className={styles.dropdown}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className={styles.DropdownContainer}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <label
          className={styles.DropdownLabel}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {typeof label === 'string' ? <span>{label}</span> : label}
        </label>
        <button
          type="button"
          className={`${styles.DropdownButton} ${activeDropdown === "element" ? styles.activeDropdown : ''}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDropdownToggle(e, "element");
          }}
        >
          {selectedElement ? selectedElement : name}
        </button>
        {activeDropdown === "element" && (
          <ul
            className={styles.elementList}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {elements.map((element, index) => (
              <li
                key={index}
                className={`${styles.dropdownItem} ${selectedElement === element ? styles.selected : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleElementClick(e, element);
                }}
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

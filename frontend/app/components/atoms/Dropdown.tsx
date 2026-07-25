import React, { useState } from "react";
import styles from "../../../styles/components/atoms/Dropdown.module.scss";

interface DropdownProps {
  label: string | React.ReactNode;
  value?: string;
  isVisible: boolean;
  elements: string[];
  name: string;
  onChange: (value: string) => void;
  // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar sidebar).
  compact?: boolean;
}


const Dropdown: React.FC<DropdownProps> = ({
  label,
  value,
  isVisible,
  elements,
  name,
  onChange,
  compact = false,
}) => {
  const [selectedElement, setselectedElement] = useState<string | null>(value ?? null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  React.useEffect(() => {
    // Intentionally mount-only: notifies the parent once with the initial value. Call
    // sites needing continuous sync as `value` changes later already remount this
    // component via `key={...}` (see EditMeeting/NewMeeting's zoom-room dropdowns).
    if (value) {
      onChange(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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


  // String labels (e.g. "Repeats") stay outside the button as a plain text caption; icon
  // labels move inside the button so the icon and value read as one field, not two boxes.
  const isStringLabel = typeof label === 'string';

  return (
    <div className={`${styles.dropdown} ${compact ? styles.compact : ''}`}>
      <div className={styles.DropdownContainer}>
        {isStringLabel && (
          <label className={styles.DropdownLabel}>
            <span>{label}</span>
          </label>
        )}
        <button
          className={`${styles.DropdownButton} ${activeDropdown === "element" ? styles.activeDropdown : ''}`}
          onClick={() => handleDropdownToggle("element")}
        >
          <span className={styles.DropdownButtonContent}>
            {!isStringLabel && label && <span className={styles.DropdownIcon}>{label}</span>}
            <span className={styles.DropdownButtonText}>{selectedElement ? selectedElement : name}</span>
          </span>
          <img src="/svg/drop-down-arrow.svg" alt="" className={styles.dropdownArrow} />
        </button>
        {activeDropdown === "element" && (
          <ul className={`${styles.elementList} ${!isStringLabel ? styles.elementListFullWidth : ''}`}>
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

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
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    // Intentionally mount-only: notifies the parent once with the initial value. Call
    // sites needing continuous sync as `value` changes later either remount this
    // component via `key={...}` (see EditMeeting/NewMeeting's zoom-room dropdowns) or
    // rely on the value-sync effect below (see CalendarNavbar's view dropdown, which
    // stays mounted -- remounting it would re-fire this onChange on every selection).
    if (value) {
      onChange(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps a non-remounting Dropdown's displayed selection in sync when the parent
  // changes `value` out from under it. Deliberately doesn't call onChange -- that
  // would re-notify the parent of a value it just told us about, right back where the
  // key-remount pattern's duplicate-onChange problem started.
  React.useEffect(() => {
    if (value !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setselectedElement(value);
    }
  }, [value]);

  if (!isVisible) return null;

  const handleDropdownToggle = (dropdownType: string) => {
    setActiveDropdown((prev) => (prev === dropdownType ? null : dropdownType));
  };

  const handleElementClick = (element: string) => {
    setselectedElement(element);
    onChange(element);
    setActiveDropdown(null);
  };

  const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, element: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleElementClick(element);
      buttonRef.current?.focus();
    } else if (e.key === 'Escape') {
      setActiveDropdown(null);
      buttonRef.current?.focus();
    }
  };

  // String labels (e.g. "Repeats") stay outside the button as a plain text caption; icon
  // labels move inside the button so the icon and value read as one field, not two boxes.
  // An empty string ("" -- passed when a call site wants neither) must count as no label,
  // same as omitting the prop entirely.
  const isStringLabel = typeof label === 'string' && label.trim().length > 0;

  return (
    <div className={`${styles.dropdown} ${compact ? styles.compact : ''}`}>
      <div className={styles.DropdownContainer}>
        {isStringLabel && (
          <label className={styles.DropdownLabel}>
            <span>{label}</span>
          </label>
        )}
        <button
          ref={buttonRef}
          className={`${styles.DropdownButton} ${activeDropdown === "element" ? styles.activeDropdown : ''}`}
          onClick={() => handleDropdownToggle("element")}
          aria-haspopup="listbox"
          aria-expanded={activeDropdown === "element"}
        >
          <span className={styles.DropdownButtonContent}>
            {!isStringLabel && label && <span className={styles.DropdownIcon}>{label}</span>}
            <span className={styles.DropdownButtonText}>{selectedElement ? selectedElement : name}</span>
          </span>
          <img src="/svg/drop-down-arrow.svg" alt="" className={styles.dropdownArrow} />
        </button>
        {activeDropdown === "element" && (
          <ul
            className={`${styles.elementList} ${!isStringLabel ? styles.elementListFullWidth : ''}`}
            role="listbox"
            aria-label={name}
          >
            {elements.map((element, index) => (
              <li
                key={index}
                role="option"
                aria-selected={selectedElement === element}
                tabIndex={0}
                className={`${styles.dropdownItem} ${selectedElement === element ? styles.selected : ''}`}
                onClick={() => handleElementClick(element)}
                onKeyDown={(e) => handleOptionKeyDown(e, element)}
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

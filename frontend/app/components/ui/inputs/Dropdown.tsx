import React, { useState } from "react";
import Icon from "../displays/Icon";
import styles from "./Dropdown.module.scss";
import { useDismissibleLayer } from "../../../../hooks/useDismissibleLayer";

interface DropdownProps {
  label: string | React.ReactNode;
  value?: string;
  isVisible: boolean;
  elements: string[];
  name: string;
  onChange: (value: string) => void;
  // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar sidebar).
  compact?: boolean;
  // Optional custom rendering for an element's display (both the closed button's selected
  // value and each open-list row) -- `element` is still the plain string used for selection/
  // onChange; this only overrides what's shown. Falls back to plain text when omitted, so
  // existing callers (Room, Zoom Room, view switcher) render exactly as before.
  renderElement?: (element: string) => React.ReactNode;
  // Explicit accessible name for the closed trigger button, for callers whose renderElement
  // hides its own text visually (e.g. the icon-only view switchers, which display: none their
  // label text in the closed state) -- without this, that button has no accessible name at
  // all, since its icons all have alt="". Other callers rely on the button's own visible text
  // content instead, same as before this prop existed.
  ariaLabel?: string;
}


const Dropdown: React.FC<DropdownProps> = ({
  label,
  value,
  isVisible,
  elements,
  name,
  onChange,
  compact = false,
  renderElement,
  ariaLabel,
}) => {
  const [selectedElement, setselectedElement] = useState<string | null>(value ?? null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const firstOptionRef = React.useRef<HTMLLIElement>(null);

  // isVisible is checked here too: the component returns null below when hidden, which would
  // otherwise leave an unrenderable layer registered on the stack, swallowing Escape.
  const isOpen = isVisible && activeDropdown === "element";

  // containerRef (not the list) is the layer root, so a click on the trigger button reads as
  // inside and is left to the button's own toggle instead of closing and immediately reopening.
  useDismissibleLayer({
    isOpen,
    onDismiss: () => setActiveDropdown(null),
    contentRef: containerRef,
    initialFocusRef: firstOptionRef,
  });

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
    // Escape is handled by useDismissibleLayer (topmost layer only), which also restores focus
    // to the trigger button on close.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleElementClick(element);
    }
  };

  // String labels (e.g. "Repeats") stay outside the button as a plain text caption; icon
  // labels move inside the button so the icon and value read as one field, not two boxes.
  // An empty string ("" -- passed when a call site wants neither) must count as no label,
  // same as omitting the prop entirely.
  const isStringLabel = typeof label === 'string' && label.trim().length > 0;

  return (
    <div className={`${styles.dropdown} ${compact ? styles.compact : ''}`}>
      <div className={styles.DropdownContainer} ref={containerRef}>
        {isStringLabel && (
          <label className={styles.DropdownLabel}>
            <span>{label}</span>
          </label>
        )}
        <button
          // Explicit: this trigger renders inside the meeting <form>, where a typeless
          // button would default to submitting it.
          type="button"
          className={`${styles.DropdownButton} ${isOpen ? styles.activeDropdown : ''}`}
          onClick={() => handleDropdownToggle("element")}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
        >
          <span className={styles.DropdownButtonContent}>
            {!isStringLabel && label && <span className={styles.DropdownIcon}>{label}</span>}
            <span className={styles.DropdownButtonText}>
              {selectedElement ? (renderElement ? renderElement(selectedElement) : selectedElement) : name}
            </span>
          </span>
          <Icon name="drop-down-arrow" className={styles.dropdownArrow} />
        </button>
        {isOpen && (
          <ul
            className={`${styles.elementList} ${!isStringLabel ? styles.elementListFullWidth : ''}`}
            role="listbox"
            aria-label={name}
          >
            {elements.map((element, index) => (
              <li
                key={index}
                ref={index === 0 ? firstOptionRef : undefined}
                role="option"
                aria-selected={selectedElement === element}
                tabIndex={0}
                className={`${styles.dropdownItem} ${selectedElement === element ? styles.selected : ''}`}
                onClick={() => handleElementClick(element)}
                onKeyDown={(e) => handleOptionKeyDown(e, element)}
              >
                {renderElement ? renderElement(element) : element}
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
};

export default Dropdown;

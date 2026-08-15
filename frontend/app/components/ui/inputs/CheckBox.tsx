import React from 'react';
import styles from "./Checkbox.module.scss"

interface LabeledCheckBoxProps {
    label: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    color: string;
    // Background when unchecked -- defaults to transparent (FilterGroup's look); the Meeting
    // Form's checkboxes opt into a white fill instead.
    uncheckedBg?: string;
    // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar
    // sidebar) -- used by RecurringMeeting's "This meeting is recurring" checkbox, not
    // FilterGroup's (Location/Zoom Rooms filters sit in the sidebar directly, unaffected).
    compact?: boolean;
}

const LabeledCheckbox: React.FC<LabeledCheckBoxProps> = ({ label, checked, onChange, color, uncheckedBg = 'transparent', compact = false }) => {
    return (
        <label className={`${styles.checkbox} ${compact ? styles.compact : ''}`}>
            <input
                type="checkbox"
                checked={checked}
                onChange={onChange}
                className={styles.checkboxInput}
            />
            <span className={styles.customCheckbox} style={{ backgroundColor: checked ? color : uncheckedBg, borderColor: color }}><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className={styles.checkmark}><path fill="currentColor" d="m9 20.42l-6.21-6.21l2.83-2.83L9 14.77l9.88-9.89l2.83 2.83z"/></svg></span>
            <span className={styles.checkboxLabel}>{label}</span>
        </label>
    );
  };
  
  export default LabeledCheckbox;
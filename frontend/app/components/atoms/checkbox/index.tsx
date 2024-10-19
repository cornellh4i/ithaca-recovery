import React from 'react';
import styles from "../../../../styles/components/atoms/Checkbox.module.scss"

interface LabeledCheckBoxProps {
    label: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    color: string;
}

const LabeledCheckbox: React.FC<LabeledCheckBoxProps> = ({ label, checked, onChange, color }) => {
    return (
        <label className={styles.checkbox}>
            <input
                type="checkbox"
                checked={checked}
                onChange={onChange}
                className={styles.checkboxInput}
            />
            <span className={styles.customCheckbox} style={{ backgroundColor: checked ? color : 'transparent', borderColor: color }}><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className={styles.checkmark}><path fill="currentColor" d="m9 20.42l-6.21-6.21l2.83-2.83L9 14.77l9.88-9.89l2.83 2.83z"/></svg></span>
            <span className={styles.checkboxLabel}>{label}</span>
        </label>
    );
  };
  
  export default LabeledCheckbox;
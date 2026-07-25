import React from 'react';
import styles from '../../../styles/components/atoms/ModeTypeButtons.module.scss';

interface ModeButtonsProps {
  selectedMode: string;
  onModeSelect: (mode: string) => void;
  // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar sidebar).
  compact?: boolean;
}

const ModeButtons: React.FC<ModeButtonsProps> = ({ selectedMode, onModeSelect, compact = false }) => {
  const buttonClassName = (mode: string) =>
    `${styles.button} ${compact ? styles.compact : ""} ${selectedMode === mode ? styles.selected : ""}`;

  return (
    <div className={styles.meetingButtons}>
      <button
        className={buttonClassName("Hybrid")}
        onClick={() => onModeSelect("Hybrid")}
      >
        Hybrid
      </button>
      <button
        className={buttonClassName("In Person")}
        onClick={() => onModeSelect("In Person")}
      >
        In Person
      </button>
      <button
        className={buttonClassName("Remote")}
        onClick={() => onModeSelect("Remote")}
      >
        Remote
      </button>
    </div>
  );
};

export default ModeButtons;
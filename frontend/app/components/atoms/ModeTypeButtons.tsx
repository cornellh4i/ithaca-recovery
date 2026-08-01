import React from 'react';
import styles from '../../../styles/components/atoms/ModeTypeButtons.module.scss';
import { MODE_ICON_SRC } from '../../../util/modeIcons';

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
        <img src={MODE_ICON_SRC.Hybrid} alt="" className={styles.icon} />
        Hybrid
      </button>
      <button
        className={buttonClassName("In Person")}
        onClick={() => onModeSelect("In Person")}
      >
        <img src={MODE_ICON_SRC["In Person"]} alt="" className={styles.icon} />
        In Person
      </button>
      <button
        className={buttonClassName("Remote")}
        onClick={() => onModeSelect("Remote")}
      >
        <img src={MODE_ICON_SRC.Remote} alt="" className={styles.icon} />
        Remote
      </button>
    </div>
  );
};

export default ModeButtons;
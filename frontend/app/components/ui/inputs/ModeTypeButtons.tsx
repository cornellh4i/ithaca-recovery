import React from 'react';
import styles from './ModeTypeButtons.module.scss';
import { MODE_ICON_NAME } from '../../../../util/rooms/modeIcons';
import Icon from '../displays/Icon';

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
      {/* Explicit type on all three: these render inside the meeting <form>, where a
          typeless button would default to submitting it. */}
      <button
        type="button"
        className={buttonClassName("Hybrid")}
        onClick={() => onModeSelect("Hybrid")}
      >
        <Icon name={MODE_ICON_NAME.Hybrid} className={styles.icon} />
        Hybrid
      </button>
      <button
        type="button"
        className={buttonClassName("In Person")}
        onClick={() => onModeSelect("In Person")}
      >
        <Icon name={MODE_ICON_NAME["In Person"]} className={styles.icon} />
        In Person
      </button>
      <button
        type="button"
        className={buttonClassName("Remote")}
        onClick={() => onModeSelect("Remote")}
      >
        <Icon name={MODE_ICON_NAME.Remote} className={styles.icon} />
        Remote
      </button>
    </div>
  );
};

export default ModeButtons;
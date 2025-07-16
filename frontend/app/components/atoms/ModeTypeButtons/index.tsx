import React, { useState } from 'react';
import styles from '../../../../styles/components/organisms/MeetingForm.module.scss';

interface ModeButtonsProps {
  selectedMode: string;
  onModeSelect: (mode: string) => void;
}

const ModeButtons: React.FC<ModeButtonsProps> = ({ selectedMode, onModeSelect }) => {
  return (
    <div className={styles.meetingButtons}>
      <button
        className={`${styles.button} ${selectedMode === "Hybrid" ? styles.selected : ""}`}
        onClick={() => onModeSelect("Hybrid")}
      >
        Hybrid
      </button>
      <button
        className={`${styles.button} ${selectedMode === "In Person" ? styles.selected : ""}`}
        onClick={() => onModeSelect("In Person")}
      >
        In Person
      </button>
      <button
        className={`${styles.button} ${selectedMode === "Remote" ? styles.selected : ""}`}
        onClick={() => onModeSelect("Remote")}
      >
        Remote
      </button>
    </div>
  );
};

export default ModeButtons;
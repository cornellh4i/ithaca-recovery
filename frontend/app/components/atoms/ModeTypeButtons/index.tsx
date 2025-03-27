import React, { useState } from 'react';
import styles from '../../../../styles/components/organisms/NewMeeting.module.scss';

interface ModeButtonsProps {
  onModeSelect: (mode: string) => void;
}

const ModeButtons: React.FC<ModeButtonsProps> = ({ onModeSelect }) => {
  const [selectedMode, setSelectedMode] = useState<string>("");

  const handleModeClick = (mode: string) => {
    setSelectedMode(mode);
    onModeSelect(mode);
  };

  return (
    <div className={styles.meetingButtons}>
      <button
        className={`${styles.button} ${selectedMode === "Hybrid" ? styles.active : ""}`}
        onClick={() => handleModeClick("Hybrid")}
      >
        Hybrid
      </button>
      <button
        className={`${styles.button} ${selectedMode === "In Person" ? styles.active : ""}`}
        onClick={() => handleModeClick("In Person")}
      >
        In Person
      </button>
      <button
        className={`${styles.button} ${selectedMode === "Remote" ? styles.active : ""}`}
        onClick={() => handleModeClick("Remote")}
      >
        Remote
      </button>
    </div>
  );
};

export default ModeButtons;

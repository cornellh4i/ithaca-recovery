import React from 'react';
import styles from './ModeTypeButtons.module.scss';
import { MODE_ICON_NAME } from '../../../../util/rooms/modeIcons';
import Icon from '../displays/Icon';

const MODES = ["Hybrid", "In Person", "Remote"] as const;

interface ModeButtonsProps {
  selectedMode: string;
  onModeSelect: (mode: string) => void;
  // Scales font-size to ~80% for narrow embedding contexts (the 280px Main Calendar sidebar).
  compact?: boolean;
  // Modes this picker may not choose -- a linked schedule can't take the mode the meeting's other
  // schedule already runs (util/meetings/linkedSchedules.ts's availableModesFor). Rendered
  // disabled rather than hidden so the row keeps its shape and the admin can see why: the
  // remaining choices read as "the modes left," not as the only modes that exist.
  disabledModes?: string[];
}

const ModeButtons: React.FC<ModeButtonsProps> = ({
  selectedMode,
  onModeSelect,
  compact = false,
  disabledModes = [],
}) => {
  const buttonClassName = (mode: string) =>
    `${styles.button} ${compact ? styles.compact : ""} ${selectedMode === mode ? styles.selected : ""}`;

  return (
    <div className={styles.meetingButtons}>
      {/* Explicit type on all three: these render inside the meeting <form>, where a
          typeless button would default to submitting it. */}
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={buttonClassName(mode)}
          onClick={() => onModeSelect(mode)}
          disabled={disabledModes.includes(mode)}
        >
          <Icon name={MODE_ICON_NAME[mode]} className={styles.icon} />
          {mode}
        </button>
      ))}
    </div>
  );
};

export default ModeButtons;

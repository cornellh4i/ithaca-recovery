import React, { useState } from 'react';
import TextField from '../ui/inputs/TextField';
import LabeledCheckbox from '../ui/inputs/CheckBox';
import { CAL_TYPE_COLOR } from '../../../hooks/useMeetingForm';
import styles from './AdvancedZoomSettings.module.scss';

interface AdvancedZoomSettingsProps {
  zoomCustomPasscode: string;
  onZoomCustomPasscodeChange: (value: string) => void;
  zoomMeetAnytime: boolean;
  onZoomMeetAnytimeChange: (value: boolean) => void;
  zoomJoinBeforeHost: boolean;
  onZoomJoinBeforeHostChange: (value: boolean) => void;
  // Same gate as the Zoom host field above it -- only Zoom-bearing modes show it.
  isVisible: boolean;
  passcodeError?: string;
  onPasscodeBlur?: () => void;
  compact?: boolean;
}

/**
 * Disclosure under the Zoom host field for the settings most meetings never touch: a custom
 * passcode (pushed to Zoom; blank = leave Zoom's alone), "meet anytime" (Zoom type 3, no fixed
 * time -- calendars keep the real schedule), and join-before-host. Sibling of ZoomHostField,
 * not part of it, so the host dropdown's async availability machinery stays self-contained.
 */
const AdvancedZoomSettings: React.FC<AdvancedZoomSettingsProps> = ({
  zoomCustomPasscode,
  onZoomCustomPasscodeChange,
  zoomMeetAnytime,
  onZoomMeetAnytimeChange,
  zoomJoinBeforeHost,
  onZoomJoinBeforeHostChange,
  isVisible,
  passcodeError,
  onPasscodeBlur,
  compact = false,
}) => {
  // Display state only -- collapsed hides nothing from the payload.
  const [isOpen, setIsOpen] = useState(false);

  if (!isVisible) return null;

  return (
    <div data-testid="advanced-zoom-settings" className={styles.container}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`${styles.toggle} ${compact ? styles.compact : ""}`}
      >
        {isOpen ? "Hide advanced Zoom settings" : "Advanced Zoom settings"}
      </button>
      {isOpen && (
        <div className={styles.fields}>
          <div>
            <TextField
              input="Custom passcode"
              value={zoomCustomPasscode}
              onChange={onZoomCustomPasscodeChange}
              onBlur={onPasscodeBlur}
              error={passcodeError}
              compact={compact}
            />
            <span className={`${styles.hint} ${compact ? styles.compact : ""}`}>
              Up to 10 characters (letters, numbers, @ - _ *). Changing it invalidates previously shared join links; leave blank to keep Zoom&apos;s current passcode.
            </span>
          </div>
          <LabeledCheckbox
            label="Meet anytime (recurring, no fixed time)"
            checked={zoomMeetAnytime}
            onChange={() => onZoomMeetAnytimeChange(!zoomMeetAnytime)}
            color={CAL_TYPE_COLOR}
            uncheckedBg="var(--surface)"
            compact={compact}
          />
          <LabeledCheckbox
            label="Allow joining before the host"
            checked={zoomJoinBeforeHost}
            onChange={() => onZoomJoinBeforeHostChange(!zoomJoinBeforeHost)}
            color={CAL_TYPE_COLOR}
            uncheckedBg="var(--surface)"
            compact={compact}
          />
        </div>
      )}
    </div>
  );
};

export default AdvancedZoomSettings;

import React, { useState } from 'react';
import Dropdown from '../atoms/Dropdown';
import { useZoomHostPool } from '../../../hooks/useZoomHostPool';
import { zoomHostLabel } from '../../../util/zoomHosts';
import { IMeeting } from '../../../util/models';
import styles from '../../../styles/components/molecules/ZoomHostField.module.scss';

const AUTOMATIC = 'Automatic assignment';

// Shared by NewMeeting.tsx/EditMeeting.tsx -- the Zoom Host dropdown, its "Check host
// availability" action, and the label<->email mapping this all needs. Kept out of
// useMeetingForm.ts because it owns its own async fetch/availability state, not just form
// field state, and out of the two call sites directly to avoid duplicating that logic twice.
export interface ZoomHostFieldProps {
  zoomHost: string;
  onZoomHostChange: (value: string) => void;
  isVisible: boolean;
  compact?: boolean;
  // Builds the same IMeeting-shaped payload the real submit uses, for the availability check
  // to send as-is (see util/meetingValidation.ts's zoomHostAvailabilityCheckSchema, which
  // only reads mid/startDateTime/endDateTime/isRecurring/recurrencePattern from it).
  getCandidate: () => IMeeting | null;
}

const decorate = (label: string, available: boolean | undefined): string =>
  available === undefined ? label : `${label} ${available ? '✓' : '✗'}`;

// Strips the trailing " ✓"/" ✗" a decorated label may carry, to recover the base label for
// matching against the label->email map built from the (undecorated) pool.
const undecorate = (label: string): string => label.replace(/ [✓✗]$/, '');

export const ZoomHostField: React.FC<ZoomHostFieldProps> = ({
  zoomHost,
  onZoomHostChange,
  isVisible,
  compact = false,
  getCandidate,
}) => {
  const hosts = useZoomHostPool();
  const [availability, setAvailability] = useState<Record<string, boolean> | null>(null);
  const [checking, setChecking] = useState(false);

  if (!isVisible) return null;

  const labelToEmail: Record<string, string> = {};
  hosts.forEach((email, i) => { labelToEmail[zoomHostLabel(email, i)] = email; });

  const elements = [
    AUTOMATIC,
    ...hosts.map((email, i) => decorate(zoomHostLabel(email, i), availability?.[email])),
  ];

  const selectedLabel = zoomHost
    ? decorate(zoomHostLabel(zoomHost, hosts.indexOf(zoomHost)), availability?.[zoomHost])
    : AUTOMATIC;

  const handleChange = (value: string) => {
    if (value === AUTOMATIC) {
      onZoomHostChange('');
      return;
    }
    const email = labelToEmail[undecorate(value)];
    if (email) onZoomHostChange(email);
  };

  const checkAvailability = async () => {
    const candidate = getCandidate();
    if (!candidate) return;

    setChecking(true);
    try {
      const res = await fetch('/api/retrieve/zoom-host-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!res.ok) return;
      const data = await res.json();
      const next: Record<string, boolean> = {};
      (data.hosts ?? []).forEach((h: { host: string; available: boolean }) => {
        next[h.host] = h.available;
      });
      setAvailability(next);
    } finally {
      setChecking(false);
    }
  };

  const selectedIsBusy = !!zoomHost && availability?.[zoomHost] === false;

  return (
    <div className={styles.zoomHostField}>
      <button type="button" className={styles.checkAvailabilityButton} onClick={checkAvailability} disabled={checking}>
        {checking ? 'Checking…' : 'Check host availability'}
      </button>
      <Dropdown
        key={selectedLabel}
        label={<img src="/svg/person-icon.svg" alt="Person Icon" />}
        value={selectedLabel}
        isVisible
        elements={elements}
        name="Select Zoom Host"
        onChange={handleChange}
        compact={compact}
      />
      {selectedIsBusy && (
        <p className={styles.busyWarning}>This host has a scheduling conflict at the selected time.</p>
      )}
    </div>
  );
};

export default ZoomHostField;

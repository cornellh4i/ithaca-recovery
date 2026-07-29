import React, { useEffect, useRef, useState } from 'react';
import Dropdown from '../atoms/Dropdown';
import { useZoomHostPool } from '../../../hooks/useZoomHostPool';
import { zoomHostLabel } from '../../../util/zoomHosts';
import { IMeeting } from '../../../util/models';
import styles from '../../../styles/components/molecules/ZoomHostField.module.scss';

const AUTOMATIC = 'Automatic assignment';

// Shared by NewMeeting.tsx/EditMeeting.tsx -- the Zoom Host dropdown, its automatic
// availability check (fires on date/time/recurrence change, see the debounced effect below),
// and the label<->email mapping this all needs. Kept out of useMeetingForm.ts because it owns
// its own async fetch/availability state, not just form field state, and out of the two call
// sites directly to avoid duplicating that logic twice.
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

// Google Material Symbols "check" / "close" glyphs -- fill is driven entirely by CSS
// (.checkIcon/.crossIcon below), not the path's own fill attribute, so the same markup
// works for both colors without two separate asset files.
const CheckIcon: React.FC = () => (
  <svg viewBox="0 -960 960 960" className={styles.checkIcon} aria-hidden="true">
    <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
  </svg>
);

const CrossIcon: React.FC = () => (
  <svg viewBox="0 -960 960 960" className={styles.crossIcon} aria-hidden="true">
    <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
  </svg>
);

// How long to wait, after the candidate (date/time/recurrence) last changed, before firing
// the availability check -- long enough that a user still actively typing/dragging a date
// picker doesn't trigger a request per intermediate value, short enough to feel immediate
// once they stop.
const DEBOUNCE_MS = 500;

// The check usually resolves in well under a second, which made "Checking host availability…"
// flash on and off almost instantly -- distracting rather than informative. Holding it visible
// for at least this long (padding out the remainder in checkAvailability's finally block) reads
// as an actual status update instead of a flicker.
const MIN_CHECKING_DISPLAY_MS = 2000;

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Identifies the most recently started check -- a superseded one (a newer candidateKey
  // fired another check before this one's minimum display time elapsed) skips writing its
  // result/clearing `checking`, so it can't clobber a check that's since taken its place.
  const checkIdRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Deliberately excludes mid: NewMeeting.tsx's getCandidate calls buildMeetingPayload(uuidv4(),
  // ...) -- a fresh random mid on every single call, including ones this effect itself causes
  // via setAvailability(null) below. Including it here made every render look like "the
  // candidate changed" (the mid is never the same twice), which reset the debounce timer every
  // render in a tight loop instead of only on an actual date/time/recurrence edit. mid only
  // matters for excluding the meeting from its own conflict check server-side (see
  // zoomHostAvailabilityCheckSchema) -- it doesn't affect what the check itself should return,
  // so it has no business being part of "did the candidate change."
  const candidate = isVisible ? getCandidate() : null;
  const candidateKey = candidate
    ? JSON.stringify({
      start: candidate.startDateTime,
      end: candidate.endDateTime,
      isRecurring: candidate.isRecurring,
      recurrencePattern: candidate.recurrencePattern,
    })
    : null;

  const checkAvailability = async () => {
    const freshCandidate = getCandidate();
    if (!freshCandidate) return;

    const checkId = ++checkIdRef.current;
    setChecking(true);
    const startedAt = Date.now();
    try {
      const res = await fetch('/api/retrieve/zoom-host-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(freshCandidate),
      });
      if (!res.ok) return;
      const data = await res.json();
      const next: Record<string, boolean> = {};
      (data.hosts ?? []).forEach((h: { host: string; available: boolean }) => {
        next[h.host] = h.available;
      });
      if (checkId === checkIdRef.current && isMountedRef.current) setAvailability(next);
    } finally {
      const remaining = MIN_CHECKING_DISPLAY_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (checkId === checkIdRef.current && isMountedRef.current) setChecking(false);
    }
  };

  // Fires automatically whenever the meeting's date/time/recurrence changes (including once
  // on mount, so opening an edit already shows availability without requiring an edit first)
  // -- debounced so a user still actively changing the date/time doesn't fire a request per
  // intermediate value. Marks are cleared the instant something relevant changes (not left
  // showing the old result during the debounce/request window), since a stale check/cross
  // would describe a time that's no longer selected -- actively misleading, not just stale.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAvailability(null);
    if (!candidateKey) return;

    debounceRef.current = setTimeout(() => {
      checkAvailability();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey]);

  if (!isVisible) return null;

  const labelToEmail: Record<string, string> = {};
  hosts.forEach((email, i) => { labelToEmail[zoomHostLabel(email, i)] = email; });

  const elements = [AUTOMATIC, ...hosts.map((email, i) => zoomHostLabel(email, i))];

  const selectedLabel = zoomHost ? zoomHostLabel(zoomHost, hosts.indexOf(zoomHost)) : AUTOMATIC;

  const handleChange = (value: string) => {
    if (value === AUTOMATIC) {
      onZoomHostChange('');
      return;
    }
    const email = labelToEmail[value];
    if (email) onZoomHostChange(email);
  };

  // Right-aligned check/cross next to each host's label, reflecting the most recent
  // automatic availability check -- no icon at all until a check has actually resolved
  // (availability starts/resets to null) or for the Automatic option (never has a per-host
  // result).
  const renderElement = (label: string): React.ReactNode => {
    const email = labelToEmail[label];
    const available = email ? availability?.[email] : undefined;
    return (
      <span className={styles.hostOption}>
        <span className={styles.hostLabel}>{label}</span>
        {available !== undefined && (available ? <CheckIcon /> : <CrossIcon />)}
      </span>
    );
  };

  const selectedIsBusy = !!zoomHost && availability?.[zoomHost] === false;

  return (
    <div className={styles.zoomHostField}>
      {checking && <p className={styles.checkingIndicator}>Checking host availability…</p>}
      <Dropdown
        key={selectedLabel}
        label={<img src="/svg/person-icon.svg" alt="Person Icon" />}
        value={selectedLabel}
        isVisible
        elements={elements}
        name="Select Zoom Host"
        onChange={handleChange}
        compact={compact}
        renderElement={renderElement}
      />
      {selectedIsBusy && (
        <p className={styles.busyWarning}>This host has a scheduling conflict at the selected time.</p>
      )}
    </div>
  );
};

export default ZoomHostField;

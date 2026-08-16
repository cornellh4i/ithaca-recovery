import React, { useState } from 'react';
import Link from 'next/link';
import Icon from '../ui/displays/Icon';
import styles from './MeetingSyncStatusBand.module.scss';
import { formatSuspensionStatusText } from '../../../util/meetings/suspensionText';

interface MeetingSyncStatusBandProps {
  // BUG-022: this band is admin-only, matching how the API layer gates raw sync status -- it
  // references admin-only actions (Retry sync) and pages (Admin Diagnostics) a public viewer
  // can't use anyway. null while the caller's own auth check is still pending -- treated the
  // same as false (hidden).
  isAdmin: boolean | null;
  googleSyncStatus: string | null;
  googleSyncError: string | null;
  zoomSyncStatus: string | null;
  zoomSyncError: string | null;
  syncing: boolean;
  onRetrySync: () => void;
  conflictCount: number;
  // Whether the meeting has any suspension to report -- the caller (ViewMeeting) already
  // computes this itself for its own kebab-menu logic, so it's passed in rather than re-derived
  // from suspendedSince here.
  hasSuspension: boolean;
  suspendedSince?: Date | null;
  resumesAt?: Date | null;
  suspensionActive?: boolean;
}

// Admin-only sync-failure/conflict/suspension status band, rendered above ViewMeeting's
// schedule section. Renders nothing at all (not even for a signed-in non-admin) unless there's
// actually something to report.
const MeetingSyncStatusBand: React.FC<MeetingSyncStatusBandProps> = ({
  isAdmin,
  googleSyncStatus,
  googleSyncError,
  zoomSyncStatus,
  zoomSyncError,
  syncing,
  onRetrySync,
  conflictCount,
  hasSuspension,
  suspendedSince,
  resumesAt,
  suspensionActive,
}) => {
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const hasSyncFailure = googleSyncStatus === 'error' || zoomSyncStatus === 'error';

  if (!isAdmin || !(hasSyncFailure || conflictCount > 0 || hasSuspension)) return null;

  return (
    <div className={styles.statusBand}>
      {hasSyncFailure && (
        <div className={styles.syncFailureBlock}>
          <div className={styles.syncFailureHeader}>
            <Icon name="sync-error" />
            <span>Failed to sync</span>
            <button
              className={styles.syncDetailsToggle}
              aria-expanded={syncDetailsOpen}
              aria-label={syncDetailsOpen ? "Hide sync error details" : "Show sync error details"}
              onClick={() => setSyncDetailsOpen((v) => !v)}
            >
              <Icon name="danger-circle" />
            </button>
          </div>
          {syncDetailsOpen && (
            <div className={styles.syncDetailsList}>
              {googleSyncStatus === 'error' && (
                <div>Google Calendar: &quot;{googleSyncError ?? 'Sync failed.'}&quot;</div>
              )}
              {zoomSyncStatus === 'error' && (
                <div>Zoom: &quot;{zoomSyncError ?? 'Sync failed.'}&quot;</div>
              )}
            </div>
          )}
          <button
            onClick={onRetrySync}
            disabled={syncing}
            className={styles.retryButton}
          >
            {syncing ? 'Retrying…' : 'Retry sync'}
          </button>
        </div>
      )}

      {conflictCount > 0 && (
        <div className={styles.conflictBlock}>
          <Icon name="warning" />
          <span>
            Conflicts with {conflictCount} other meeting{conflictCount === 1 ? '' : 's'} —{' '}
            <Link href="/admin" className={styles.diagnosticsLink}>view the Admin Diagnostics page</Link> for more info.
          </span>
        </div>
      )}

      {hasSuspension && (
        <div className={styles.suspensionBlock}>
          <Icon name="pause" />
          <span>{formatSuspensionStatusText(suspendedSince, resumesAt, suspensionActive)}</span>
        </div>
      )}
    </div>
  );
};

export default MeetingSyncStatusBand;

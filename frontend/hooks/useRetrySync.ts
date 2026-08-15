import { useState } from "react";
import { retryMeetingSync } from "../services/syncMeeting";
import { useToast } from "../app/components/shared/ToastProvider";

export interface UseRetrySyncOptions {
  mid: string;
  initialGoogleSyncStatus?: string | null;
  initialGoogleSyncError?: string | null;
  initialZoomSyncStatus?: string | null;
  initialZoomSyncError?: string | null;
  onSyncSuccess?: () => void;
}

export interface UseRetrySyncResult {
  googleSyncStatus: string | null;
  googleSyncError: string | null;
  zoomSyncStatus: string | null;
  zoomSyncError: string | null;
  syncing: boolean;
  handleRetrySync: () => Promise<void>;
}

// Orchestrates a meeting's "Retry sync" action -- fires the retry request, updates the
// per-channel status/error state ViewMeeting's sync-status band renders, and reports success/
// failure via toast. Requires a ToastProvider ancestor (useToast throws otherwise), same as
// the component this was extracted from.
export function useRetrySync({
  mid,
  initialGoogleSyncStatus = null,
  initialGoogleSyncError = null,
  initialZoomSyncStatus = null,
  initialZoomSyncError = null,
  onSyncSuccess,
}: UseRetrySyncOptions): UseRetrySyncResult {
  const { showToast } = useToast();
  const [googleSyncStatus, setGoogleSyncStatus] = useState(initialGoogleSyncStatus);
  const [googleSyncError, setGoogleSyncError] = useState(initialGoogleSyncError);
  const [zoomSyncStatus, setZoomSyncStatus] = useState(initialZoomSyncStatus);
  const [zoomSyncError, setZoomSyncError] = useState(initialZoomSyncError);
  const [syncing, setSyncing] = useState(false);

  const handleRetrySync = async () => {
    setSyncing(true);
    try {
      const data = await retryMeetingSync(mid);
      setGoogleSyncStatus(data.googleSyncStatus ?? 'error');
      setGoogleSyncError(data.googleSyncError ?? null);
      setZoomSyncStatus(data.zoomSyncStatus ?? null);
      setZoomSyncError(data.zoomSyncError ?? null);
      // Only report success once every *applicable* channel is synced -- zoomSyncStatus is
      // legitimately null for a meeting that doesn't need Zoom, so null shouldn't count against
      // it, but 'error' on either side must still block onSyncSuccess.
      const calendarOk = data.googleSyncStatus == null || data.googleSyncStatus === 'synced';
      const zoomOk = data.zoomSyncStatus == null || data.zoomSyncStatus === 'synced';
      if (calendarOk && zoomOk) {
        onSyncSuccess?.();
        showToast({ variant: "success", title: "Sync retried successfully." });
      } else {
        const failures = [
          !calendarOk && `Google Calendar (${data.googleSyncError ?? 'sync failed'})`,
          !zoomOk && `Zoom (${data.zoomSyncError ?? 'sync failed'})`,
        ].filter(Boolean).join(', ');
        showToast({ variant: "error", title: `Retry failed: ${failures}` });
      }
    } catch {
      // Stale from a prior fetch/retry -- this failure is the request itself, not a specific
      // provider error, so clear it and let the details list fall back to "Sync failed.".
      setGoogleSyncStatus('error');
      setGoogleSyncError(null);
      showToast({ variant: "error", title: "Could not retry the sync." });
    } finally {
      setSyncing(false);
    }
  };

  return { googleSyncStatus, googleSyncError, zoomSyncStatus, zoomSyncError, syncing, handleRetrySync };
}

export interface MeetingSyncResult {
  googleSyncStatus: string | null;
  googleSyncError: string | null;
  zoomSyncStatus: string | null;
  zoomSyncError: string | null;
}

// Shared by ViewMeeting.tsx's "Retry sync" button (retrying one meeting from its own detail
// view) and DiagnosticsTab.tsx's Sync Issues panel (retrying any meeting from the admin's
// aggregate list) -- both hit the same route, the only real duplication was this fetch itself.
// Each caller still owns its own loading state and what to do with the result, since those
// genuinely differ (ViewMeeting updates its own local status fields; Diagnostics just reloads).
export async function retryMeetingSync(mid: string): Promise<MeetingSyncResult> {
  const response = await fetch('/api/update/meeting/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mid }),
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}

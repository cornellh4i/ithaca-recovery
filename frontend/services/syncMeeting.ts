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

export interface MeetingSyncPollResult extends MeetingSyncResult {
  // False if every poll attempt was exhausted while a channel the caller expected to sync was
  // still "pending"/unset -- the caller should stay silent rather than report a false failure.
  settled: boolean;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 4;

// Meeting create/update (write/meeting and update/meeting routes) defer the actual Zoom/
// Calendar sync to Next's after(), which runs *after* that request's response is already sent
// -- so the create/update response has no fresh sync status to read, only whatever the row
// held before this run. This polls the meeting's own record (the authenticated GET returns the
// full row -- see retrieve/meeting/[id]/route.ts) until every channel the caller expects to
// sync has left "pending"/null, so NewMeeting/EditMeeting can toast the real outcome a few
// seconds later instead of staying silent on a sync failure.
//
// expectGoogle/expectZoom come from the payload just submitted, not guessed here -- a channel
// that was never going to sync (e.g. Zoom for an In Person meeting) would otherwise poll
// pointlessly until MAX_POLL_ATTEMPTS gives up.
export async function pollMeetingSyncStatus(
  mid: string,
  { expectGoogle, expectZoom }: { expectGoogle: boolean; expectZoom: boolean },
): Promise<MeetingSyncPollResult> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await fetch(`/api/retrieve/meeting/${mid}`);
    if (!response.ok) continue;
    const data = await response.json();
    const googleDone = !expectGoogle || (data.googleSyncStatus != null && data.googleSyncStatus !== 'pending');
    const zoomDone = !expectZoom || (data.zoomSyncStatus != null && data.zoomSyncStatus !== 'pending');
    if (googleDone && zoomDone) {
      return {
        googleSyncStatus: data.googleSyncStatus ?? null,
        googleSyncError: data.googleSyncError ?? null,
        zoomSyncStatus: data.zoomSyncStatus ?? null,
        zoomSyncError: data.zoomSyncError ?? null,
        settled: true,
      };
    }
  }
  return { googleSyncStatus: null, googleSyncError: null, zoomSyncStatus: null, zoomSyncError: null, settled: false };
}

// Builds a human-readable follow-up toast message from a settled poll result, or null if
// nothing failed (caller should stay silent -- the initial "Meeting created/updated" toast
// already covered the happy path, and a second "sync succeeded" toast would be redundant).
export function describeSyncFailure(result: MeetingSyncPollResult): string | null {
  if (!result.settled) return null;
  const failures: string[] = [];
  if (result.googleSyncStatus === 'error') {
    failures.push(`Google Calendar (${result.googleSyncError ?? 'sync failed'})`);
  }
  if (result.zoomSyncStatus === 'error') {
    failures.push(`Zoom (${result.zoomSyncError ?? 'sync failed'})`);
  }
  if (failures.length === 0) return null;
  return `The meeting saved, but failed to sync: ${failures.join(', ')}. Retry from the meeting's details.`;
}

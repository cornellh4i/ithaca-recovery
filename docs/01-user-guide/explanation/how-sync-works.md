# How Calendar and Zoom Sync Work

## Google Calendar is one-way

> [!NOTE]
> Always edit meetings in the platform, not directly in Google Calendar.

The platform is the single source of truth. Changes made here sync automatically to Google Calendar, but sync is **one-way only**:

- **Direct edits in Google Calendar will not sync back** to the platform.
- **Subsequent platform syncs will overwrite** any changes made directly in Google Calendar.

## Why sync can fail, and what the sync-error badge means

Meetings are saved to the platform **immediately**, while Google Calendar and Zoom sync in the background. 

- **Sync failures:** The meeting stays saved on the platform, but displays a **sync-error badge**
  (see the [Icon and Badge Legend](../reference/icon-and-badge-legend.md) for what it looks like).
- **Separately tracked, but oftentimes dependent:** Google Calendar and Zoom each get their own status. For In Person meetings (no Zoom involved) they're fully independent. For Hybrid/Remote meetings, though, Google Calendar sync **waits on Zoom** — if Zoom hasn't succeeded yet, Google sync is deferred rather than attempted, so a Zoom failure delays Google too (see [How automatic Zoom host assignment works](#how-automatic-zoom-host-assignment-works) below for the most common cause).
- **Data protection:** Outages or permission errors won't erase your entry.

> See [Retry a Failed Sync](../how-to/retry-a-failed-sync.md) to resolve sync issues.

## Why Zoom and Google Calendar Sync Separately

Hybrid and Remote meetings require two separated actions: creating a Zoom meeting and publishing to Google Calendar. Because either can fail on its own, the platform tracks and reports their status separately.

## Why Zoom Sync May Be Delayed

ICR uses a shared pool of licensed Zoom accounts across all rooms rather than dedicated accounts. Each licensed account can host up to two meetings at the same time, so:

- **If all hosts are busy:** Your meeting still saves to the platform.
- **Sync status:** Zoom displays an error until a host becomes available or you manually retry.

## How automatic Zoom host assignment works

Leaving **Zoom Host** on "Automatic assignment" picks the **least-busy licensed host with spare capacity** (a licensed host can carry two concurrent meetings; a basic host is only used as a last resort) (see [Meeting Fields and Modes](../reference/meeting-fields-and-modes.md)). Note that pool hosts are fixed by system administrators and cannot be managed in the UI.

- **All hosts busy:** If no host is free, the meeting still saves, but Zoom sync fails with a "no host available" error (see [Retry a Failed Sync](../how-to/retry-a-failed-sync.md)). Consequently, the meeting will also not sync to Google.
- **Manual selection:** The dropdown displays each host's remaining capacity for the selected time as a badge — e.g. **1/2** in green (one of two slots free) or **0/2** in red (at capacity). Hand-picking is primarily useful for troubleshooting.
- **Sync retry behavior:** Retrying a failed initial sync re-checks the pool and may assign a different host. Retrying a meeting that already has a Zoom link reuses the existing host.
- **Host visibility:** The specific assigned host is intentionally hidden once synced—the UI simply shows "Synced."

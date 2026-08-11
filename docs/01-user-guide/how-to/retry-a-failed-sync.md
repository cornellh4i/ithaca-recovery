# Retry a Failed Sync

A meeting showing a ⚠ badge means its Google Calendar and/or Zoom sync failed — see
[how sync works](../explanation/how-sync-works.md) for why this can happen without losing the
meeting itself.

![A ⚠ badge on a calendar block indicating a sync failure](../assets/sync-error-badge.png)

1. Click the meeting to open its detail panel.
2. The sync status is shown as separate lines for Google Calendar and Zoom, each with its own
   failure reason if applicable.
3. Click **"Retry sync."**

![Meeting detail panel showing a Failed to sync error with a Retry sync button](../assets/sync-error-detail-panel.png)

If the underlying problem has cleared (a Zoom host freed up, the Google Calendar API is reachable
again), the retry succeeds and the badge clears. If not, it fails again with the same or an
updated reason — safe to retry as many times as needed, it doesn't create duplicate meetings or
duplicate Zoom sessions.

This same retry can also be triggered from the **Sync Issues** card on **Admin → Diagnostics**, which lists
every meeting currently showing a sync problem in one place — useful for checking on multiple
meetings at once rather than finding them individually on the calendar.

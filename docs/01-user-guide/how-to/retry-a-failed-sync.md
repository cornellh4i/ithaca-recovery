# Retry a Failed Sync

A meeting showing a sync-error badge means its Google Calendar and/or Zoom sync failed — see
[how sync works](../explanation/how-sync-works.md) for why this can happen without losing the
meeting itself, or the [Icon and Badge Legend](../reference/icon-and-badge-legend.md) if you're not
sure which icon this is (it's not the same as the amber conflict triangle).

![A sync-error badge on a calendar block indicating a sync failure](../assets/sync-error-badge.png)

1. Click the meeting to open its detail panel.
2. The sync status is shown as separate lines for Google Calendar and Zoom, each with its own
   failure reason if applicable.
3. Click **"Retry sync."**

![Meeting detail panel showing a Failed to sync error with a Retry sync button](../assets/sync-error-detail-panel.png)

If the underlying problem has cleared (a Zoom host freed up, the Google Calendar API is reachable
again), the retry succeeds and the badge clears. If not, it fails again with the same or an
updated reason — safe to retry as many times as needed, it doesn't create duplicate meetings or
duplicate Zoom sessions.

## The one case retry can't fix

If the detail panel reads **"Google authorization expired"** instead of "Failed to sync", the
account's Google authorization is gone and **Retry sync** is disabled — replaying the same write
against a dead authorization only reproduces the same error. The **Sync Issues** card on
**Admin → Diagnostics** disables its own Retry buttons for the same reason, and its System Status
card names the condition.

Click **Reconnect Google** (in the panel, or in the banner across the top of the app) and approve
the Google consent screen. Nothing republishes on its own afterwards: come back to the meeting and
click **Retry sync**, which is enabled again once the authorization is renewed.

This same retry can also be triggered from the **Sync Issues** card on **Admin → Diagnostics**, which lists
every meeting currently showing a sync problem in one place — useful for checking on multiple
meetings at once rather than finding them individually on the calendar.

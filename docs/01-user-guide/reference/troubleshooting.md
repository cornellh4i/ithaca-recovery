# Troubleshooting

| Problem | What to try |
|---|---|
| Can't sign in | Confirm you're using the Google account whose email a Super Admin has added — see [Manage Admin Users](../how-to/manage-admin-users.md) |
| No "Admin" link in the top nav | Only shows for accounts with admin access. Ask a Super Admin to check your role |
| Calendar shows no meetings | Check that a room/category filter wasn't unchecked in the Filters sidebar. Click "Today" to reset the date. |
| Meeting not visible after creating it | Wait 30 seconds for the auto-refresh, or reload the page |
| Zoom link is blank on a meeting | Open the meeting, if it shows a sync-error badge, use [Retry a Failed Sync](../how-to/retry-a-failed-sync.md) first. Deleting and recreating is a last resort; it's permanent, see [why some actions can't be undone](../explanation/why-some-actions-cant-be-undone.md) |
| A meeting shows a sync-error badge | Google Calendar and/or Zoom sync failed for that meeting. See [Retry a Failed Sync](../how-to/retry-a-failed-sync.md) |
| Not sure what an icon or badge on the calendar means | See the [Icon and Badge Legend](icon-and-badge-legend.md) |
| "Export Lease CSV" fails with no meetings to export | Confirm at least one non-deleted meeting exists (suspended meetings still count) |
| Page behaves unexpectedly | Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). Or try a different browser |
| Accidentally deleted a meeting | Deleted meetings can't be recovered ([learn why](../explanation/why-some-actions-cant-be-undone.md)); recreate it manually. For a recurring series, pick **This event** instead of **All events** when you only mean to cancel one occurrence |
| Need to know which room is free at a given time | Go to Day view for the date and, in the Filters sidebar, uncheck all rooms except the one you're checking. Any open time blocks are available |

## Backups tab

| Problem | What to try |
|---|---|
| Warning banner: "No restore has ever been verified" or "Last verified restore was N months ago" | Not an emergency — it means the quarterly restore drill is pending or overdue. See [Check Backups and Run One](../how-to/check-backups-and-run-one.md) |
| "Backup monitoring isn't configured in this environment" panel | Backup credentials aren't set up for this environment. Contact the H4I Maintenance Lead; this cannot be fixed from user side |
| A backup run failed | A GitHub issue opens automatically to notify the H4I team; report it per [Support Process](../../02-handoff/support-process.md) if it's urgent |
| "Back Up Now" button is disabled/greyed out | A backup is already running, only one can run at a time. Wait for it to finish, then try again |

## Contact

For technical issues with the platform: [Nathnael Tesfaw](mailto:nbt26@cornell.edu) (Fall 2026 H4I Maintenance lead) — expected response
time 2-3 business days during school year, best effort during summer/winter break. See [Support Process](../../02-handoff/support-process.md).

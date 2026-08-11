# Troubleshooting

| Problem | What to try |
|---|---|
| Can't sign in | Confirm you're using the Google account whose email a Super Admin has added — see [Manage Admin Users](../how-to/manage-admin-users.md) |
| No "Admin" link in the top nav | It's hidden, not locked/disabled — only shows for accounts with admin access. Ask a Super Admin to check your role |
| Calendar shows no meetings | Check that a room/category filter wasn't unchecked in the Filters sidebar. Click "Today" to reset the date. |
| Meeting not visible after creating it | Wait 30 seconds for the auto-refresh, or reload the page |
| Zoom link is blank on a meeting | Open the meeting — if it shows a ⚠ badge, use [Retry a Failed Sync](../how-to/retry-a-failed-sync.md) first. Deleting and recreating is a last resort, not a first step — it's permanent, see [why some actions can't be undone](../explanation/why-some-actions-cant-be-undone.md) |
| A meeting shows a ⚠ badge | Google Calendar and/or Zoom sync failed for that meeting — see [Retry a Failed Sync](../how-to/retry-a-failed-sync.md) |
| "Export Lease CSV" fails with no meetings to export | Confirm at least one non-deleted meeting exists (suspended meetings still count) |
| Page behaves unexpectedly | Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). Or try a different browser |

## Common scenarios

**"I accidentally deleted a meeting."** Deleted meetings can't be recovered ([learn why](../explanation/why-some-actions-cant-be-undone.md)) and must be recreated manually. For recurring series, ensure you select **This event** instead of **All events** if you only intend to cancel a single occurrence.

**"Which room is free at a given time?"** Go to Day view for the date, uncheck all rooms except
the one you're checking in the Filters sidebar. Any open time blocks are available.

## Contact

For technical issues with the platform: [Nathnael Tesfaw](mailto:nbt26@cornell.edu) (current H4I Maintenance lead) — expected response
time `[TODO]`. See [Support Process](../../02-handoff/support-process.md).

# Why Some Actions Can't Be Undone

## Permanent Meeting Deletion

> [!WARNING]
> Deleting a meeting (or single occurrence) is permanent and immediately removes it from both the platform and Google Calendar.

- **No recovery:** Deleted meetings cannot be restored; they must be recreated manually.
- **Reversible alternative:** Use [Suspend](../how-to/suspend-and-resume-a-meeting.md) instead if you might need to restore the meeting later.
- **Best practice:** Perform an [Export Meetings](../how-to/export-data.md) backup before bulk modifications.

## Super Admin Protection

> [!IMPORTANT]
> The system prevents demoting or deleting the final Super Admin to avoid permanent lockout. Always promote a new Super Admin before removing the outgoing user's credentials.

## Editing Recurring Series

Saving an edit to a recurring meeting asks which occurrences it applies to — **This event**, **This and following events**, or **All events** (see [Create, Edit, and Delete Meetings](../how-to/create-edit-delete-meetings.md)). The Zoom link stays the same across all three; only Google Calendar and the meeting's own details change.

- **This event** detaches the clicked occurrence into its own standalone meeting — it's no longer part of the series and won't follow future edits to it.
- **This and following events** splits the series in two at the clicked date: everything before keeps its old details, everything from that date on picks up the new ones.
- **All events** applies the change to the entire series, same as before.

There's no "undo" for a scope choice once saved — picking the wrong one means repeating the edit with the correct scope.

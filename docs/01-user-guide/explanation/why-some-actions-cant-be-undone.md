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

Edits to a recurring series apply to **all occurrences**. To modify a single date without affecting the rest:

1. Delete the single occurrence.
2. Create a separate, standalone meeting for that specific date (see [Create, Edit, and Delete Meetings](../how-to/create-edit-delete-meetings.md)).

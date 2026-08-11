# Manage Admin Users

Go to **Admin → Users** (Super-Admin-only).

## Invite a new admin

Click **"Invite,"** enter their email and pick a role in the **"Invite user"** dialog, then click
**"Send Invite."** This adds
them to the platform immediately — it does **not** send them an email, so let them know directly
that they can now sign in with that Google account. See
[Roles and Permissions](../reference/roles-and-permissions.md) for what each role can do.

## Change or remove access

Use a row's role dropdown to promote or demote that admin, or click **Remove** to take them off
the platform entirely. The last remaining Super Admin's controls are disabled — see
[why some actions can't be undone](../explanation/why-some-actions-cant-be-undone.md#super-admin-protection).

## Best practices for board transitions

> [!IMPORTANT]
> Invite the incoming board member **before** removing the outgoing member's access — doing it in
> the other order can leave a gap where the meeting schedule needs an admin action and nobody's
> around to take it.

- Before a board member leaves, confirm all active recurring meetings have correct Zoom rooms
  assigned.
- Run an Export Meetings backup (see [Export Data](export-data.md)) before any large-scale
  changes.

# Roles and Permissions

Three roles, each a superset of the one before it.

| Role | Can do |
|---|---|
| **User** (no sign-in and basic users) | View the calendar and `/signage`.|
| **Admin** | Everything a User can, plus: create, edit, delete, suspend, and resume meetings; retry a failed sync; view the Diagnostics tab. |
| **Super Admin** | Everything an Admin can, plus: invite/remove admins and change their roles (Users tab); use the Export tab (meetings backup, lease CSV, signage URL generator, lease/export settings). |

## How you get a role

Sign-in is invite-only — there's no self-registration. A Super Admin adds your email under
**Admin → Users → Send Invite**, picking your role at that point. You can't sign in at all until
that happens (see [Your First Meeting](../tutorials/your-first-meeting.md)).

## Changing or losing a role

A Super Admin can promote/demote any admin's role, or remove them entirely, from the Users tab. A role change or removal takes effect immediately, only requiring a page refresh to see it.

> [!NOTE]
> **The platform will not let the last remaining Super Admin be demoted or removed**. When you are the last Super Admin, the row's role dropdown and Remove button are disabled, with a caption explaining why. This exists so the
> platform can never end up with nobody able to manage it. See
> [Manage Admin Users](../how-to/manage-admin-users.md).



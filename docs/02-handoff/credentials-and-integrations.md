# Credentials and Integrations [STUB]

Answers the handoff meeting item: *review the Google Cloud OAuth credentials, Zoom integration,
Google Calendar access, environment variables, service accounts, API keys, and any other
credentials required for the application to function; document who controls each and how changes
are coordinated.*

This is the **ownership** view. For setup/configuration steps for each of these, see
[`../03-development/integration-guides.md`](../03-development/integration-guides.md) — that doc
explains *how* to configure each credential; this one explains *who* controls it and *who to ask*
before it changes.

---

## Credential inventory

[TODO: fill in the "Controlled by" and "Coordination" columns for each row]

| Credential | Purpose | Where it lives | Controlled by | Coordination needed before changing |
|---|---|---|---|---|
| `DATABASE_URL` | MongoDB Atlas connection string | Vercel env vars | | Rotating this requires updating Vercel + confirming no other consumer holds the old string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app (NextAuth) | Google Cloud Console project + Vercel env vars | | Changing the OAuth app affects every signed-in admin |
| `NEXTAUTH_SECRET` | Session JWT signing | Vercel env vars | | Rotating invalidates all active sessions |
| `GOOGLE_CALENDAR_AA` / `_ALANON` / `_OTHER` | Category calendar IDs | Google Calendar + Vercel env vars | | Each calendar must stay shared with every signed-in admin's Google account (see integration-guides.md §4) |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth app | Zoom Marketplace + Vercel env vars | | |
| `ZOOM_HOSTS` | Pool of licensed Zoom host emails | Vercel env vars + Zoom account licensing | | Removing a host from the pool without removing their Zoom license (or vice versa) causes silent sync failures |
| `GOOGLE_CALENDAR_ZOOM_<ROOM>` (×5) | Per-room Zoom join-link calendars | Google Calendar + Vercel env vars | | Must match what each room's physical Zoom Room hardware is actually configured to read |
| PandaDocs account | Bulk-send lease documents | PandaDocs | | Not app-integrated — manual CSV upload, see integration-guides.md §6 |

## Who has access to what today

[TODO: list actual people/roles with access to the Google Cloud project, Zoom account, MongoDB
Atlas org, Vercel project, and PandaDocs account]

## Process for rotating or changing a credential

[TODO: define a lightweight process — e.g. "post in [channel], get ack from [role], rotate in
Vercel + source system together, verify via `GET /api/admin/diagnostics`"]

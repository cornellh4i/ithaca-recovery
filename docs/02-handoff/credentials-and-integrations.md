# Credentials and Integrations [STUB]

Answers the handoff meeting item: *review the Google Cloud OAuth credentials, Zoom integration,
Google Calendar access, environment variables, service accounts, API keys, and any other
credentials required for the application to function; document who controls each and how changes
are coordinated.*

This is the **ownership** view. For setup/configuration steps for each of these, see
[Integration Guides](../03-development/integration-guides.md) — that doc
explains *how* to configure each credential; this one explains *who* controls it and *who to ask*
before it changes.

---

## Credential inventory

[TODO: fill in remaining "Controlled by" gaps and the "Coordination" column for each row]

| Credential | Purpose | Where it lives | Controlled by | Coordination needed before changing |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL (Neon) connection string, **pooled** variant (the `-pooler` hostname) | Vercel env vars | Neon project owner — [Tuni Le](mailto:ttl38@cornell.edu), shared account `ithacacommunityrecoverytest@gmail.com` (see [Ownership and Access](ownership-and-access.md)) | Rotating this requires updating Vercel + confirming no other consumer holds the old string |
| `DATABASE_URL_UNPOOLED` | PostgreSQL (Neon) connection string, **direct/unpooled** variant — backup workflow only, not used by the app itself (pgbouncer transaction-mode pooling breaks `pg_dump`'s session-level operations) | GitHub Actions secret | Same Neon owner as `DATABASE_URL` above | Sourced fresh from the Neon dashboard with pooling toggled off, not derived from `DATABASE_URL`; see [Backups and Recovery](backups-and-recovery.md) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app (NextAuth) | Google Cloud Console project + Vercel env vars | **Prod:** ICR. **Dev:** H4I, `ithacacommunityrecoverytest@gmail.com` — separate OAuth apps per environment | Changing the OAuth app affects every signed-in admin |
| `NEXTAUTH_SECRET` | Session JWT signing | Vercel env vars | N/A — not tied to any external account, it's a locally-generated random value. In practice "controlled by" just means whoever has write access to that environment's Vercel env vars | Rotating invalidates all active sessions |
| `GOOGLE_CALENDAR_AA` / `_ALANON` / `_OTHER` | Category calendar IDs | Google Calendar + Vercel env vars | **Prod:** ICR. **Dev:** H4I, `ithacacommunityrecoverytest@gmail.com` — same prod/dev split as the Google OAuth app above | Each calendar must stay shared with every signed-in admin's Google account (see [Integration Guides §3](../03-development/integration-guides.md#3-google-calendar-api)) |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth app | Zoom Marketplace + Vercel env vars | ICR, account `ithacacommunityrecovery@gmail.com` (no "test" — distinct from the Vercel/Neon/dev-Google account above) — same across both Prod and Dev | |
| `ZOOM_HOSTS` | Pool of licensed Zoom host emails | Vercel env vars + Zoom account licensing | **Prod:** host accounts belong to ICR. **Dev:** host accounts belong to H4I. (The Zoom app itself above is one ICR account regardless — this is about which individual host *users* are in the pool per environment) | Removing a host from the pool without removing their Zoom license (or vice versa) causes silent sync failures |
| `GOOGLE_CALENDAR_ZOOM_<ROOM>` (×5) | Per-room Zoom join-link calendars | Google Calendar + Vercel env vars | **Prod:** ICR. **Dev:** H4I, `ithacacommunityrecoverytest@gmail.com` — same prod/dev split as the category calendars above | Must match what each room's physical Zoom Room hardware is actually configured to read |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_SERVICE_ACCOUNT` | Backup workflow's GCS auth (Workload Identity Federation, no downloaded service-account key) | GitHub Actions variables (non-secret by design) | | Locked to this exact repo via an attribute condition on the WIF provider — see the backup feature's implementation plan |
| `GCS_BACKUP_BUCKET` | Name of the private GCS bucket backups upload to | GitHub Actions variable | | |
| `AGE_PUBLIC_KEY` | Encrypts each backup before upload — public, safe even if it leaked (can only encrypt) | GitHub Actions variable | | The matching **private** key is never in CI — stored offline, see [Backups and Recovery](backups-and-recovery.md) |

*The last three rows (backup-workflow credentials) describe the designed-but-not-yet-built backup
feature — see [Backups and Recovery](backups-and-recovery.md) for status. They don't exist
anywhere yet; listed here so the inventory stays complete once that work resumes.*

## Who has access to what today

[TODO: list actual people/roles with access to the Google Cloud project, Zoom account, Neon
(Postgres) project, and Vercel project]

## Process for rotating or changing a credential

[TODO: define a lightweight process — e.g. "post in [channel], get ack from [role], rotate in
Vercel + source system together, verify via `GET /api/admin/diagnostics`"]

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
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 API token (Account-level, Object Read & Write, scoped to the one backup bucket, TTL forever — rotate only on suspected compromise) — third storage target for the backup workflow | GitHub Actions **secrets** | Cloudflare account owner (same org that holds the other Cloudflare access, if any) | Rotating requires generating a new scoped token in the Cloudflare dashboard and updating all three GitHub secrets together (they're one token) |
| `R2_BUCKET` | Name of the R2 bucket (`icr-db-backup-r2`) backups upload to, Object Lock (Governance mode) enabled at creation | GitHub Actions **variable** | Cloudflare account owner | Object Lock can't be enabled after bucket creation — a bucket rename requires provisioning a new bucket, not just updating this variable |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_SERVICE_ACCOUNT` | Backup workflow's auth into the **production** GCP project (Workload Identity Federation, no downloaded service-account key) — uploads to `GCS_WORKING_BUCKET` | GitHub Actions **variables** (non-secret by design — WIF federates trust, there's no long-lived key to protect) | Same GCP project owner as the app's own Google Calendar OAuth credentials | Locked to this exact repo via an attribute condition on the WIF provider; the SA holds `roles/storage.objectCreator` only (no delete, no overwrite) |
| `GCS_WORKING_BUCKET` | Name of the production-project GCS bucket (`icr-db-backups-prod`) — the operational copy the admin UI lists/downloads from | GitHub Actions **variable** | Same GCP project owner as above | Bucket-level lifecycle rules (`daily/` 21d, `monthly/` 407d) are the only deletion path — renaming means re-provisioning lifecycle rules too |
| `GCP_ARCHIVE_WORKLOAD_IDENTITY_PROVIDER` / `GCP_ARCHIVE_SERVICE_ACCOUNT` | Backup workflow's auth into the **archive** GCP project (`icr-backups-archive`) — a separate WIF pool/provider/binding, fully independent of the production-project one above (WIF trust is scoped per-project, not shared) | GitHub Actions **variables** | Same production Google account (`…@518icr.com`) as the production project, but a distinct GCP project — deliberately not the shared dev/test Google account, which has standing test-user access for other student contributors | Rotating either pair only affects the archive upload leg; the production leg is untouched |
| `GCS_ARCHIVE_BUCKET` | Name of the archive-project GCS bucket (`icr-db-backups-archive`) — pure redundancy + immutability copy, bucket-level retention policy (400 days, unlocked) | GitHub Actions **variable** | Same account as the archive project above | Retention is bucket-level, not per-object — see [Backups and Recovery](backups-and-recovery.md) for why 400d covers both GFS tiers there |
| `AGE_PUBLIC_KEY_A` / `AGE_PUBLIC_KEY_B` | Two `age` public keys each backup is encrypted to (`age -r A -r B`) — either private key alone decrypts (OR, not AND), so the archive survives one holder being unreachable | GitHub Actions **variables** — public keys are safe even if leaked (can only encrypt) | **PENDING** (key ceremony not yet performed as of 2026-08-16) — once generated: **Key A**'s private key custody = the Maintenance Lead role's password manager (the project's persistent cross-semester contact); **Key B**'s private key custody = an org-owned vault outside the semesterly student rotation (ICR staff-side or a long-lived H4I account) | Both **private** keys are never put in GitHub, Vercel, or any CI system, in any form — including a GitHub "environment secret". See [Backups and Recovery](backups-and-recovery.md) for the full key-rotation and compromise procedure |

*`DATABASE_URL_UNPOOLED` and the backup-workflow rows above back the backup feature — see
[Backups and Recovery](backups-and-recovery.md) for the shipped 3-2-1-1-0 design, GFS retention,
and break-glass restore procedure. All are live as of 2026-08-16 except the `age` key ceremony
(`AGE_PUBLIC_KEY_A`/`_B` still unset) and the Cloudflare usage-notification/billing follow-ups
tracked there.*

## Who has access to what today

[TODO: list actual people/roles with access to the Google Cloud project, Zoom account, Neon
(Postgres) project, and Vercel project]

## Process for rotating or changing a credential

[TODO: define a lightweight process — e.g. "post in [channel], get ack from [role], rotate in
Vercel + source system together, verify via `GET /api/admin/diagnostics`"]

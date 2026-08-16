# Credentials and Integrations

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

Two Google accounts control nearly everything — all external services (Vercel, Neon,
Cloudflare, GCP) are signed into via Google with one of them:

- **Prod account** — `dev@518icr.com`: both GCP projects, the production OAuth app and
  calendars, and the Cloudflare account.
- **Dev account** — `ithacacommunityrecoverytest@gmail.com`: Vercel, Neon, the dev OAuth app
  and dev calendars (and, as a stopgap, the billing account both GCP projects link to).
- **Zoom account** — `zoom@518icr.com`: the Zoom Server-to-Server app and host licensing (same
  account for both environments).

**Open question:** the Cloudflare account currently lives under the Prod account — decide
whether that's desirable long-term or whether R2 should move to a dedicated/org account.

### Application (Vercel env vars)

| Credential | Purpose | Where it lives | Controlled by | Coordination needed before changing |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL (Neon) connection string, **pooled** variant (the `-pooler` hostname) | Vercel env vars | Dev account | Rotating this requires updating Vercel + confirming no other consumer holds the old string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app (NextAuth) — separate OAuth apps per environment | Google Cloud Console project + Vercel env vars | **Prod:** Prod account. **Dev:** Dev account | Changing the OAuth app affects every signed-in admin |
| `NEXTAUTH_SECRET` | Session JWT signing — a locally-generated random value, not tied to any external account | Vercel env vars | None | Rotating invalidates all active sessions |
| `GOOGLE_CALENDAR_AA` / `_ALANON` / `_OTHER` | Category calendar IDs | Google Calendar + Vercel env vars | **Prod:** Prod account. **Dev:** Dev account | Each calendar must stay shared with every signed-in admin's Google account (see [Integration Guides §3](../03-development/integration-guides.md#3-google-calendar-api)) |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth app | Zoom Marketplace + Vercel env vars | Zoom account | Marketplace secret rotation keeps the old secret valid for 30 days (the `rotate_client_secret` API invalidates it immediately) — either way, update `ZOOM_CLIENT_SECRET` in Vercel, redeploy, and verify Diagnostics + a test meeting well inside the overlap |
| `ZOOM_HOSTS` | Pool of licensed Zoom host emails — which host *users* are in the pool per environment | Vercel env vars + Zoom account licensing | Zoom account | Removing a host from the pool without removing their Zoom license (or vice versa) causes silent sync failures |
| `GOOGLE_CALENDAR_ZOOM_<ROOM>` (×5) | Per-room Zoom join-link calendars | Google Calendar + Vercel env vars | **Prod:** Prod account. **Dev:** Dev account | Must match what each room's physical Zoom Room hardware is actually configured to read |

### Backup workflow (GitHub Actions secrets/variables)

| Credential | Purpose | Where it lives | Controlled by | Coordination needed before changing |
|---|---|---|---|---|
| `DATABASE_URL_UNPOOLED` | PostgreSQL (Neon) connection string, **direct/unpooled** variant — backup workflow only, not used by the app itself (pgbouncer transaction-mode pooling breaks `pg_dump`'s session-level operations) | GitHub Actions secret | Dev account | Sourced fresh from the Neon dashboard with pooling toggled off, not derived from `DATABASE_URL`; see [Backups and Recovery](backups-and-recovery.md) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 API token (Account-level, Object Read & Write, scoped to the one backup bucket, TTL forever — a deliberate exception: a scheduled expiry would silently break backup uploads when it lapses; compensating controls are the single-bucket scope and re-issuing the token at each semester role handoff or on suspected compromise) — third storage target for the backup workflow | GitHub Actions **secrets** | Prod account (Cloudflare — see open question above) | Rotating requires generating a new scoped token in the Cloudflare dashboard and updating all three GitHub secrets together (they're one token) |
| `R2_BUCKET` | Name of the R2 bucket (`icr-db-backup-r2`) backups upload to, Object Lock (Governance mode) enabled at creation | GitHub Actions **variable** | Prod account (Cloudflare) | Object Lock can't be enabled after bucket creation — a bucket rename requires provisioning a new bucket, not just updating this variable |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_SERVICE_ACCOUNT` | Backup workflow's auth into the **production** GCP project (Workload Identity Federation, no downloaded service-account key) — uploads to `GCS_WORKING_BUCKET` | GitHub Actions **variables** (non-secret by design — WIF federates trust, there's no long-lived key to protect) | Prod account | Locked to this exact repo via an attribute condition on the WIF provider; the SA holds `roles/storage.objectCreator` only (no delete, no overwrite) |
| `GCS_WORKING_BUCKET` | Name of the production-project GCS bucket (`icr-db-backups-prod`) — the operational copy the admin UI lists/downloads from | GitHub Actions **variable** | Prod account | Bucket-level lifecycle rules (`daily/` 21d, `monthly/` 407d) are the only deletion path — renaming means re-provisioning lifecycle rules too |
| `GCP_ARCHIVE_WORKLOAD_IDENTITY_PROVIDER` / `GCP_ARCHIVE_SERVICE_ACCOUNT` | Backup workflow's auth into the **archive** GCP project (`icr-backups-archive`) — a separate WIF pool/provider/binding, fully independent of the production-project one above (WIF trust is scoped per-project, not shared) | GitHub Actions **variables** | Prod account (distinct GCP project — deliberately not the Dev account, which has standing test-user access for other student contributors) | Rotating either pair only affects the archive upload leg; the production leg is untouched |
| `GCS_ARCHIVE_BUCKET` | Name of the archive-project GCS bucket (`icr-db-backups-archive`) — pure redundancy + immutability copy, bucket-level retention policy (400 days, unlocked) | GitHub Actions **variable** | Prod account | Retention is bucket-level, not per-object — see [Backups and Recovery](backups-and-recovery.md) for why 400d covers both GFS tiers there |
| `AGE_PUBLIC_KEY_A` / `AGE_PUBLIC_KEY_B` | Two `age` public keys each backup is encrypted to (`age -r A -r B`) — either private key alone decrypts (OR, not AND), so the archive survives one holder being unreachable | GitHub Actions **variables** — public keys are safe even if leaked (can only encrypt) | Key custody, not an account: **Key A** = the Maintenance Lead role's password manager; **Key B** = an org-owned vault outside the semesterly rotation (final holder still an open decision — see [Backup Infrastructure Setup](../03-development/backup-infra-setup.md)). Ceremony done 2026-08-16 | Both **private** keys are never put in GitHub, Vercel, or any CI system, in any form — including a GitHub "environment secret". See [Backups and Recovery](backups-and-recovery.md) for the full key-rotation and compromise procedure |

### Backups admin tab (Vercel env vars)

| Credential | Purpose | Where it lives | Controlled by | Coordination needed before changing |
|---|---|---|---|---|
| `GCP_BACKUPS_WIF_PROVIDER` / `GCP_BACKUPS_SERVICE_ACCOUNT` | Keyless GCS auth for the Admin → Backups tab: Vercel OIDC → Workload Identity Federation onto the **read-only** `backups-tab-reader` service account (`objectViewer` on both GCS buckets). **Non-secret** — WIF trust is pinned to this project's production deployments; there is no key to rotate or leak | Vercel env vars | Prod account | Provisioning record in [Backup Infrastructure Setup](../03-development/backup-infra-setup.md). Deliberately not the workflow's create-only identity: read and write stay separate identities |
| `R2_ACCESS_KEY_ID_READ` / `R2_SECRET_ACCESS_KEY_READ` | **Read-only** R2 token the Backups tab checks replica presence with — a separate token from the workflow's write-scoped `R2_*` GitHub secrets above | Vercel env vars | Prod account (Cloudflare) | Rotate independently of the workflow token; both halves are one token and change together |
| `GITHUB_BACKUPS_PAT` | Fine-grained GitHub PAT (this repo only, Actions read+write) — powers the Backups tab's run history and Back Up Now dispatch | Vercel env vars | Whoever's GitHub account minted it (a repo admin) | Fine-grained PATs expire — renewal is a calendar item, not an incident; on expiry only Recent Activity/Back Up Now degrade, backups themselves keep running on cron |

*`DATABASE_URL_UNPOOLED` and the backup-workflow rows above back the backup feature — see
[Backups and Recovery](backups-and-recovery.md) for the shipped 3-2-1-1-0 design, GFS retention,
and break-glass restore procedure. All are live as of 2026-08-16; the billing re-link follow-up
is tracked in [Backup Infrastructure Setup](../03-development/backup-infra-setup.md).*

## Who has access to what today

The account legend above is the access map — access follows whoever holds each account, not any
one person (see [Ownership and Access](ownership-and-access.md) for the role handoff). Beyond
those three accounts:

- **`cornellh4i` GitHub org** — the repo, its Actions variables/secrets, and branch protection;
  the Maintenance Lead ([Support Process](support-process.md)) is the standing admin contact.
- Vercel env vars are readable by anyone on the Vercel project.

## Process for rotating or changing a credential

Lightweight, but always the same shape:

1. **Tell the Maintenance Lead first** ([Support Process](support-process.md)) — they confirm
   nothing else consumes the credential and that no deploy/backup run is mid-flight.
2. **Rotate the source and the consumer in one sitting** — generate the new value in the source
   system, update the consuming store (Vercel env vars need a redeploy to take effect; GitHub
   Actions secrets/variables apply on the next run), then revoke the old value. Never leave a
   window where only the old value is live in one place and the new in the other.
3. **Verify immediately**: Admin → Diagnostics for app credentials (DB/Google/Zoom rows),
   Admin → Backups for the tab's read credentials, and a manual `workflow_dispatch` of
   `backup-db.yml` for the backup workflow's — don't wait for the next cron run to find out.

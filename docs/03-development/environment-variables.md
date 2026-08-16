# Environment Variables

Reference for every variable `frontend/` reads. For step-by-step setup of the service each one
belongs to, see [Integration Guides](integration-guides.md). For *who controls* each one in
production and how changes are coordinated, see
[Credentials and Integrations](../02-handoff/credentials-and-integrations.md).

Create a `.env` file in `frontend/` for local development (never commit it).

```env
# Database
DATABASE_URL="postgresql://<user>:<password>@<neon-host>-pooler.../<dbname>?sslmode=require"

# Google OAuth (NextAuth)
GOOGLE_CLIENT_ID="<google-oauth-client-id>"
GOOGLE_CLIENT_SECRET="<google-oauth-client-secret>"
NEXTAUTH_SECRET="<random-secret-string>"
NEXTAUTH_URL="http://localhost:3000"   # production: https://ithaca-recovery.vercel.app

# Google Calendar — one calendar ID per meeting category
GOOGLE_CALENDAR_AA="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_ALANON="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_OTHER="<calendar-id>@group.calendar.google.com"

# Zoom — account-level credentials
ZOOM_CLIENT_ID="..."
ZOOM_CLIENT_SECRET="..."
ZOOM_ACCOUNT_ID="..."
NEXT_PUBLIC_ZOOM_BASE_API="https://api.zoom.us/v2"

# Zoom Room Calendars — one Google Calendar per Zoom-enabled room
GOOGLE_CALENDAR_ZOOM_SERENITY_ROOM="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_ZOOM_SEEDS_OF_HOPE_ROOM="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_ZOOM_UNITY_ROOM="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_ZOOM_ROOM_FOR_IMPROVEMENT="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_ZOOM_CHILDRENS_ROOM_518="<calendar-id>@group.calendar.google.com"

# Zoom Host Pool — comma-separated licensed Zoom user emails, shared across all rooms
ZOOM_HOSTS="host1@icr.org,host2@icr.org,host3@icr.org,host4@icr.org,host5@icr.org"
```

## Reference table

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL (Neon) connection string — **pooled** variant (the `-pooler` hostname), required for Vercel's serverless functions |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret |
| `NEXTAUTH_URL` | Canonical app URL NextAuth uses to build redirect/callback URLs |
| `GOOGLE_CALENDAR_AA` / `GOOGLE_CALENDAR_ALANON` / `GOOGLE_CALENDAR_OTHER` | Google Calendar IDs to publish each category's events to |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth credentials (account-level) |
| `NEXT_PUBLIC_ZOOM_BASE_API` | Zoom API base URL (`https://api.zoom.us/v2`) |
| `GOOGLE_CALENDAR_ZOOM_<ROOM>` (×5) | Google Calendar ID for each Zoom-enabled room's own calendar |
| `ZOOM_HOSTS` | Comma-separated pool of licensed Zoom user emails, shared across all rooms (see [Technical Decisions](../02-handoff/technical-decisions.md#zoom-integration)) |

**Not app env vars** — the backup workflow (`.github/workflows/backup-db.yml`) runs in GitHub
Actions, not the Next.js app, so its credentials never appear in `frontend/`'s `.env` or Vercel:

| Name | Kind | Purpose |
|---|---|---|
| `DATABASE_URL_UNPOOLED` | GH Actions secret | Neon direct/unpooled connection string — `pg_dump` breaks against the pooled `-pooler` host `DATABASE_URL` uses |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | GH Actions secrets | Cloudflare R2 API token (Object Read & Write, scoped to the one bucket) |
| `R2_BUCKET` | GH Actions variable | R2 bucket name (`icr-db-backup-r2`), Object Lock Governance mode |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_SERVICE_ACCOUNT` / `GCS_WORKING_BUCKET` | GH Actions variables | WIF auth + bucket name for the production-project GCS copy (`icr-db-backups-prod`) |
| `GCP_ARCHIVE_WORKLOAD_IDENTITY_PROVIDER` / `GCP_ARCHIVE_SERVICE_ACCOUNT` / `GCS_ARCHIVE_BUCKET` | GH Actions variables | WIF auth + bucket name for the archive-project GCS copy (`icr-db-backups-archive`, a separate GCP project) |
| `AGE_PUBLIC_KEY_A` / `AGE_PUBLIC_KEY_B` | GH Actions variables | Public `age` encryption keys — **pending**, key ceremony not yet performed |

See [Credentials and Integrations](../02-handoff/credentials-and-integrations.md) for who controls
each of these and [Backups and Recovery](../02-handoff/backups-and-recovery.md) for the full
design.

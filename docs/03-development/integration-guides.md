# Integration Guides

Step-by-step setup instructions for every external service the platform depends on. For the *why* behind each choice, see [Technical Decisions](../02-handoff/technical-decisions.md). For the full environment variable reference, see [Environment Variables](environment-variables.md).

---

## Table of Contents

1. [PostgreSQL (Neon) + Prisma](#1-postgresql-neon-prisma)
2. [Google OAuth (NextAuth)](#2-google-oauth-nextauth)
3. [Google Calendar API](#3-google-calendar-api)
4. [Zoom API](#4-zoom-api)
5. [PandaDoc / Lease Export](#5-pandadoc-lease-export)
6. [Vercel Deployment](#6-vercel-deployment)

---

## 1. PostgreSQL (Neon) + Prisma

### Prerequisites
- A [Neon](https://neon.tech) project (or any PostgreSQL instance — Neon specifically for production).
- Node.js 24+.

### Setup

1. Add your connection string to `.env` (see [Environment Variables](environment-variables.md)):
   ```env
   DATABASE_URL="postgresql://<user>:<password>@<neon-host>-pooler.../<dbname>?sslmode=require"
   ```
   - **App connection**: use Neon's **pooled** string (the `-pooler` hostname) — Vercel's serverless functions need it.
   - **Backup workflow**: the unpooled/direct string is separate, used only by the (not-yet-built) backup workflow, since `pg_dump`'s session-level operations break under pgbouncer's transaction-mode pooling — see [Backups and Recovery](../02-handoff/backups-and-recovery.md).

2. Generate the Prisma client (required after any schema change):
   ```bash
   cd frontend
   yarn prisma generate
   ```

3. Apply pending migrations:
   ```bash
   yarn prisma migrate deploy   # production/CI — applies existing migrations, no new ones generated
   yarn prisma migrate dev      # local dev — also generates a new migration from schema changes
   ```

### Schema location
`frontend/prisma/schema.prisma` — defines `Meeting`, `RecurrencePattern`, `SuspensionPeriod`, `Admin`, `LeaseSettings`, `MeetingExportSettings`, and `User` models. Migrations live in `frontend/prisma/migrations/`.

### Adding a new field
1. Add the field to the relevant model in `schema.prisma`.
2. Run `yarn prisma migrate dev --name <description>` to generate and apply a migration locally.
3. Run `yarn prisma generate` to regenerate the client types (usually automatic after `migrate dev`).
4. Update the corresponding TypeScript interface in `frontend/types/models.ts`.
5. Update any API routes that read or write that field.
6. Commit the generated migration folder under `prisma/migrations/` along with the schema change — CI applies committed migrations, it doesn't generate them.

### Viewing data
```bash
yarn prisma studio
```
Opens a browser-based data browser at `http://localhost:5555`.

---

## 2. Google OAuth (NextAuth)

### What it does
Authenticates board members via their Google account and grants the server an OAuth token scoped for Google Calendar writes, used both for sign-in and for publishing meetings to Google Calendar (section 3).

### Google Cloud setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create (or select) a project.
2. Enable the **Google Calendar API** for the project.
3. Under **Google Auth Platform → Clients → Create client**, choose **Web application** (name it something identifiable per environment, e.g. `icr-web-dev`/`icr-web-prod`).
4. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://ithaca-recovery.vercel.app/api/auth/callback/google` (prod)
5. Copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client Secret** → `GOOGLE_CLIENT_SECRET`.
6. Generate a random secret for `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`).
7. Set `NEXTAUTH_URL` to the app's own URL (NextAuth uses this to build its callback URLs).

### Verification status: External vs Internal

The `calendar.events` scope requested by this app is **sensitive**, which keeps the app in
"unverified" status (100-test-user cap) while User Type is **External** — configured under
**Google Auth Platform → Audience**.

> [!WARNING]
> While External, every signer also has to be added manually as a **Test user** on that same
> Audience page — a separate gate from the app's own `Admin` table (see Bootstrapping below).
> Google blocks sign-in for anyone not whitelisted regardless of what the `Admin` table says.

Dev and Prod are expected to land differently here:

- **Dev**: stays External/unverified — its shared `ithacacommunityrecoverytest@gmail.com` account isn't on ICR's Google Workspace domain.
- **Prod**: its Cloud project should sit under ICR's own Google Workspace org. Once it does, switching User Type to **Internal** restricts access to ICR accounts, removes the 100-user cap and test-user approval, and requires no code change.

### Adding or removing who can sign in
Sign-in is invite-only, gated by the `Admin` table — there is no separate Google Cloud "allowlist" step to manage day-to-day. See [Manage Admin Users](../01-user-guide/how-to/manage-admin-users.md) for the in-app flow (Admin → Users → Send Invite), or call `POST /api/write/admin` directly.

### Bootstrapping the first Admin

Two independent gates stand between a Google account and a working sign-in, and **both** need to be satisfied the first time:

- The app's own `Admin` table (above — no self-registration).
- Google Auth Platform's Audience page, which is "unverified"/External status (see above) — Google itself refuses to complete sign-in for any account that isn't on that page's **Test users** list, regardless of what the `Admin` table says.

**Development:**
- Easiest: sign in with the shared dev/test account, `ithacacommunityrecoverytest@gmail.com`. It's already both a `Super Admin` row in the dev database and a Test user on the dev Google Cloud project, so it works immediately.
- To use your own email instead:

  1. Sign in once with `ithacacommunityrecoverytest@gmail.com`, then go to **Admin → Users → Send Invite** and add your own email (satisfies the `Admin`-table gate).
  2. Separately, sign in to [console.cloud.google.com](https://console.cloud.google.com) with `ithacacommunityrecoverytest@gmail.com` and add your own email under **Google Auth Platform → Audience → Test users** on the dev Google Cloud project (satisfies the Google-side gate).

  Only once both are done can you sign into the app with your own email.

**Production:** there's no shared bootstrap account, and the first production Admin can't invite themselves — so the first Super Admin has to be created manually, satisfying both gates by hand:
1. Insert the first `Admin` row directly into the production database (e.g. `yarn prisma studio` pointed at the production `DATABASE_URL`, or Neon's own SQL editor in its dashboard) with `role: SUPER_ADMIN` and their email.
2. Add that same email under the production Google Cloud project's **Google Auth Platform → Audience → Test users** — production is still External/unverified today until the User Type is switched to Internal.

After that first sign-in, that person can invite everyone else through the normal Admin → Users flow — but each new admin's email still needs to be added to the Test users list too, until Internal User Type ships (see the project plan's Follow-up items).

### How the auth flow works in code

| File | Role |
|---|---|
| `frontend/app/api/auth/authConfig.ts` | NextAuth options: Google provider, `signIn`/`jwt`/`session` callbacks |
| `frontend/app/api/auth/[...nextauth]/route.ts` | Wires `authConfig.ts` into NextAuth's route handler |
| `frontend/services/auth.ts` | `getAuth()` (reads the session) and `requireRole(minRole)` (route guard) |

### Reading the session / gating a route handler

```typescript
import { requireRole } from "../../../services/auth";
import { Role } from "@prisma/client";

const auth = await requireRole(Role.ADMIN); // or Role.SUPER_ADMIN
if (auth instanceof Response) return auth;   // 401/403 already built
// auth.accessToken is the Google OAuth token; auth.user.role is the caller's role
```

`frontend/tests/unit/routeGuards.test.ts` checks every route under `app/api` for exactly this
pattern (not just that `requireRole` is imported somewhere) and fails if a new route has neither
this guard nor an entry in that test's public-route allowlist — add your new route to the
allowlist there if it's intentionally unauthenticated, rather than leaving it unchecked.

---

## 3. Google Calendar API

### What it does
When a meeting is created, updated, or deleted, the platform publishes a matching event to one Google Calendar per category in that meeting's `calType` (AA / Al-Anon / Other), using the signed-in admin's OAuth token from NextAuth.

### Setup

1. Create (or reuse) a Google Calendar per category, and share each one with whatever Google account(s) need to view it publicly or via embed.
2. Get each calendar's ID (Calendar Settings → "Integrate calendar" → Calendar ID) and set:
   ```env
   GOOGLE_CALENDAR_AA="..."
   GOOGLE_CALENDAR_ALANON="..."
   GOOGLE_CALENDAR_OTHER="..."
   ```
3. No separate service-account credentials are needed — calls use the signed-in admin's own OAuth token (`calendar.events` scope, requested at login — see section 2).

> [!IMPORTANT]
> Each of the three category calendars must be **individually shared with every Google account
> that needs to create/edit/delete meetings**, with at least "Make changes to events" permission
> (Calendar Settings → "Share with specific people" → their Google account → permission level).
> Being an app `Admin`/`SUPER_ADMIN` and being able to write to these calendars are two separate,
> unsynced permission systems — an admin can pass every in-app gate and still get silent GCal sync
> failures (the ⚠ badge, see [Retry a Failed Sync](../01-user-guide/how-to/retry-a-failed-sync.md))
> if their Google account was never shared onto the relevant calendar(s).

### Key client code
`frontend/services/googleCalendar.ts` — `calendarIdForCategory`, `calendarIdsForMeeting`, `checkCalendarReachable`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`, `deleteCalendarOccurrence` (adds an EXDATE for a single recurring occurrence), `trimCalendarEventSeries` (trims a recurring event's RRULE `UNTIL`).

### Sync behavior

- **Fail-soft**: on failure, the meeting's `googleSyncStatus` is set to `"error"` and a ⚠ badge appears in the UI; a Super/regular Admin can retry via `POST /api/update/meeting/sync`.
- **Suspended meetings are skipped**: `status: "Suspended"` meetings make no calendar calls at all.
- **Deferred, not inline**: sync runs **after** the write/update/delete response is sent, via Next's native `after()` (`next/server`) in the background — the route returns as soon as the Postgres write succeeds, not once sync finishes.
- **Response body is stale by design**: `googleSyncStatus`/`zoomSyncStatus` in that response reflect the state *before* this sync attempt (usually `null` on a fresh create), not its outcome. A client that needs the real result polls `GET /api/retrieve/meeting/[id]` afterward (`frontend/services/syncMeeting.ts#pollMeetingSyncStatus` does this for the meeting form's success toast).
- **One exception**: `POST /api/update/meeting/sync` (the manual retry route) stays synchronous, since a user clicking "Retry sync" expects an immediate result.

See [Technical Decisions](../02-handoff/technical-decisions.md#google-calendar-sync) for why.

---

## 4. Zoom API

### What it does
Creates/updates/deletes a real Zoom meeting whenever a meeting has a `zoomRoom` set, then publishes the join link to that room's own Google Calendar as the event's `location` (which Zoom Room hardware uses for one-touch join detection). See [Technical Decisions](../02-handoff/technical-decisions.md#zoom-integration) for the full design, the per-room-host rationale, and a timezone gotcha worth reading before touching this code.

### Zoom App setup

> [!NOTE]
> An app named **ICR - H4I Application** is already configured under the
> `ithacacommunityrecovery@gmail.com` Zoom account, and is shared by both dev and prod
> environments (same `ZOOM_ACCOUNT_ID`/`ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET` for both) — the steps
> below are for reference or recreating it, not something you need to do for local setup.

1. Go to [marketplace.zoom.us](https://marketplace.zoom.us) → **Develop** → **Build App** → **Server-to-Server OAuth**.
2. Fill in app name and description, activate the app.
3. Under **Scopes**, add: `meeting:write:admin`, `meeting:read:admin`, `meeting:update:admin`, `meeting:delete:admin`, and `user:read:list_users:admin` (needed to look up which licensed users exist on the account when confirming the host pool emails below).
4. Copy **Account ID**, **Client ID**, **Client Secret** → `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`.

### Host pool setup

> [!NOTE]
> Any account added to `ZOOM_HOSTS` must first be added as a **user** under the
> `ithacacommunityrecovery@gmail.com` Zoom account (Zoom Admin → **User Management** → **Users**)
> — `createZoomMeeting` schedules under `POST /users/{host email}/meetings`. An email that isn't
> a real user on that account fails outright, it isn't enough to just add it to the env var.

*Zoom licenses* act as a **shared host pool** (`ZOOM_HOSTS`, priority-ordered).

- **Host Allocation**: `resolveZoomHost` (`frontend/services/zoom.ts` / `resourceOverlap.ts`) assigns the first available host with no time overlap. Resolution runs inside the meeting's write transaction with the whole pool locked (Postgres advisory locks, same mechanism as room/Zoom Room conflicts) — a concurrent request racing for the same last-free host correctly falls back to the next free one instead of double-booking it. Availability across the whole pool is checked with a single batched query (`zoomHost: { in: pool }`, bucketed in memory) rather than one query per host — measured ~3.7x faster than the old per-host loop on a 5-host pool (4.10ms → 1.11ms per resolution, worst case).

- **API Integration**: Meetings schedule via `POST /users/{host_email}/meetings` using host emails directly.

- **Conflict Fallback**: If all hosts are busy, the meeting saves without Zoom, setting `zoomSyncStatus: "error"` and a `zoomSyncError`. Admins can retry via the UI "Retry sync" button or `POST /api/update/meeting/sync`.

- **Host Persistence**: Existing meetings retain their host across edits unless the room changes, which triggers host re-resolution and recreates the Zoom meeting.

> [!NOTE]
> Auto-assignment (`resolveZoomHost`) used to run **before** the meeting's write transaction
> opened, with only a manually-picked host covered by the write's advisory lock — a TOCTOU race
> where two concurrent requests could both see the same last-free host as available and both
> write it. Fixed: auto-assignment now locks and resolves the whole pool inside the same
> transaction as everything else, the same mechanism room/Zoom Room/manual-pick already used.
> See [issue #360](https://github.com/cornellh4i/ithaca-recovery/issues/360) for the writeup.

### Per-room setup

Each of the 5 Zoom-enabled rooms needs its own dedicated Google Calendar (separate from the 3
category calendars in section 3) — set its ID as `GOOGLE_CALENDAR_ZOOM_<ROOM>`.

- **Sharing**: same requirement as section 3 — share it with whatever Google account the signed-in admin uses.
- **Hardware match**: this must be the exact calendar that room's physical Zoom Room hardware is configured to read from in Zoom's admin console — confirm with whoever manages the Zoom account, since hardware can be pointed at a different (e.g. legacy) calendar than the one the app writes to.

Room slugs match `zoomRoomOptions` in `frontend/util/rooms/rooms.ts`: `SERENITY_ROOM`, `SEEDS_OF_HOPE_ROOM`, `UNITY_ROOM`, `ROOM_FOR_IMPROVEMENT`, `CHILDRENS_ROOM_518`.

### Key client code
`frontend/services/zoom.ts` — `checkZoomReachable`, `checkZoomHostPool`, `resolveZoomHost(candidate, client, opts)`, `createZoomMeeting(meeting, hostEmail)`, `updateZoomMeeting(zid, meeting)`, `deleteZoomMeeting(zid)`, plus the `zoomRoomCalendarId` and `zoomHostPool` lookup values. Called directly from the meeting routes (`write`, `update`, `delete`, `update/meeting/sync`) — there's no separate `/api/zoom/*` HTTP surface.

Every call first fetches a fresh token (posts to `https://zoom.us/oauth/token`, `grant_type=account_credentials`) — the token is short-lived and not cached.

### Verifying it's working

`GET /api/admin/diagnostics/system-status` checks three levels:

- **`zoom.reachable`**: account-level token fetch succeeds.
- **`zoom.roomCalendars.<room>`**: each room's dedicated Google Calendar is reachable.
- **`zoom.hostPool.<email>`**: each pooled host resolves (`ok`) to a real user on the account, and whether it's `licensed` — `false` flags a Basic-type host, which caps meetings at 40 minutes (a likely cause if meetings assigned to that host keep cutting off).

(Diagnostics is split across several endpoints — see [API Reference](api-reference.md#diagnostics) for the full list, e.g. `conflicts`, `suspended`, `sync-issues`.)

The Diagnostics tab on `/admin` surfaces all of this, plus a **Conflicts** panel listing any meetings sharing a room or Zoom Room at overlapping times.

To confirm a room end-to-end beyond what Diagnostics checks: create a real meeting in the app with
that room selected, then check that (a) the meeting shows a join link and (b) that room's Google
Calendar has a new event with the join link in its `location` field.

---

## 5. PandaDoc / Lease Export

### What it does
The Export tab's "Export Lease CSV" button generates a CSV formatted for PandaDoc's Bulk Send feature, covering every non-deleted meeting — Active and Suspended both included, since a lease is a legal obligation that doesn't end just because a meeting is temporarily hidden from the calendar. ICR uploads this CSV to PandaDoc to send annual lease documents to all groups at once.

### Configuring rates and lease details
No code changes needed. In the app: **Admin → Export → (⋮ on the lease card) → Configure export…**, which opens a modal to set the lease period, per-room rate + unit (`/hr` or `/month`), rental agent contact info, and the email message template (`{group}` placeholder). This is stored in the `LeaseSettings` singleton via `GET/PUT /api/retrieve|update/lease-settings`. Until someone saves settings, `frontend/util/leaseDefaults.ts` supplies ICR's current defaults.

### Uploading to PandaDoc
1. Export the CSV from **Admin → Export**.
2. In PandaDoc, go to **Bulk Send** → upload the CSV → select the lease template → send.

---

## 6. Vercel Deployment

### Initial setup

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the GitHub repo.
3. Set the **Root Directory** to `frontend/`.
4. Leave the **Build Command** on its default — don't override it. Vercel auto-detects Next.js and
   runs the `build` script from `package.json` as-is (see below); overriding it with a shorter
   command silently skips steps this app actually depends on at build/deploy time.
5. Add all environment variables from [Environment Variables](environment-variables.md) under **Project Settings → Environment Variables**, including production values for `NEXTAUTH_URL` and the Google OAuth redirect URI (section 2).
6. Deploy.

### Subsequent deploys
Every push to `master` triggers an automatic production deployment. Every pull request gets a preview deployment URL.

### Build command
`frontend/package.json`'s `build` script does more than run Next's own build — each step exists for a reason, so don't shorten this if you ever do need to override it in Vercel's dashboard:
```json
"build": "node build-scripts/generate-docs-content.mjs && node build-scripts/generate-pagefind-index.mjs && prisma generate && if [ \"$VERCEL_ENV\" = \"production\" ]; then prisma migrate deploy; fi && next build"
```
In order: rebuild the in-app docs snapshot, rebuild the docs search index (Pagefind), regenerate the Prisma client from the current schema, apply pending Postgres migrations (production only — preview/dev deploys don't auto-migrate), then build the Next.js app itself.

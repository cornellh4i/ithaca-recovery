# Integration Guides

Step-by-step setup instructions for every external service the platform depends on. For the *why* behind each choice, see [technical-decisions.md](../02-handoff/technical-decisions.md).

---

## Table of Contents

1. [Environment Variables Reference](#1-environment-variables-reference)
2. [MongoDB + Prisma](#2-mongodb--prisma)
3. [Google OAuth (NextAuth)](#3-google-oauth-nextauth)
4. [Google Calendar API](#4-google-calendar-api)
5. [Zoom API](#5-zoom-api)
6. [PandaDocs / Lease Export](#6-pandadocs--lease-export)
7. [Vercel Deployment](#7-vercel-deployment)

---

## 1. Environment Variables Reference

Create a `.env` file in `frontend/` (never commit it). All variables the app reads:

```env
# MongoDB
DATABASE_URL="mongodb+srv://..."

# Google OAuth (NextAuth)
GOOGLE_CLIENT_ID="<google-oauth-client-id>"
GOOGLE_CLIENT_SECRET="<google-oauth-client-secret>"
NEXTAUTH_SECRET="<random-secret-string>"
NEXTAUTH_URL="http://localhost:3000"   # production: https://ithaca-recovery.vercel.app

# Google Calendar — one calendar ID per meeting category
GOOGLE_CALENDAR_AA="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_ALANON="<calendar-id>@group.calendar.google.com"
GOOGLE_CALENDAR_OTHER="<calendar-id>@group.calendar.google.com"

# Zoom — account-level credentials (see section 5)
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

---

## 2. MongoDB + Prisma

### Prerequisites
- A MongoDB Atlas cluster (or local MongoDB instance).
- Node.js 24+.

### Setup

1. Add your connection string to `.env`:
   ```env
   DATABASE_URL="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority"
   ```

2. Generate the Prisma client (required after any schema change):
   ```bash
   cd frontend
   npx prisma generate
   ```

3. Prisma does not run migrations against MongoDB the same way it does for relational databases — it applies the schema via `prisma db push` instead:
   ```bash
   npx prisma db push
   ```

### Schema location
`frontend/prisma/schema.prisma` — defines `Meeting`, `RecurrencePattern`, `Admin`, `LeaseSettings`, and `User` models.

### Adding a new field
1. Add the field to the relevant model in `schema.prisma`.
2. Run `npx prisma generate` to regenerate the client types.
3. Run `npx prisma db push` to apply to the database.
4. Update the corresponding TypeScript interface in `frontend/util/models.ts`.
5. Update any API routes that read or write that field.

### Viewing data
```bash
npx prisma studio
```
Opens a browser-based data browser at `http://localhost:5555`.

---

## 3. Google OAuth (NextAuth)

### What it does
Authenticates board members via their Google account and grants the server an OAuth token scoped for Google Calendar writes, used both for sign-in and for publishing meetings to Google Calendar (section 4).

### Google Cloud setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create (or select) a project.
2. Enable the **Google Calendar API** for the project.
3. Under **APIs & Services → Credentials → Create credentials → OAuth 2.0 Client ID**, choose **Web application**.
4. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://ithaca-recovery.vercel.app/api/auth/callback/google` (prod)
5. Copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client Secret** → `GOOGLE_CLIENT_SECRET`.
6. Under **OAuth consent screen**, the `calendar.events` scope requested by this app is sensitive, which keeps the app in "unverified" status (100-test-user cap) while the consent screen's User Type is **External**. If the Google Cloud project sits under ICR's Google Workspace org, switching User Type to **Internal** removes that cap with no code change — see the project plan's Follow-up items for the current status of that switch.
7. Generate a random secret for `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`).
8. Set `NEXTAUTH_URL` to the app's own URL (NextAuth uses this to build its callback URLs).

### Adding or removing who can sign in
Sign-in is invite-only, gated by the `Admin` table — there is no separate Google Cloud "allowlist" step to manage day-to-day. See [user-guide.md, Section 12](../01-user-guide/user-guide.md#12-admin-user-management) for the in-app flow (Admin → Users → Send Invite), or call `POST /api/write/admin` directly.

### Bootstrapping the first Admin

Two independent gates stand between a Google account and a working sign-in, and **both** need to be satisfied the first time: the app's own `Admin` table (above — no self-registration), and Google Cloud's OAuth consent screen, which is in "unverified"/External status (step 6 above) — Google itself refuses to complete sign-in for any account that isn't on the consent screen's **Test users** list, regardless of what the `Admin` table says.

**Development:**
- Easiest: sign in with the shared dev/test account, `ithacacommunityrecoverytest@gmail.com`. It's already both a `Super Admin` row in the dev database and a Test user on the dev Google Cloud project, so it works immediately.
- To use your own email instead: sign in once with `ithacacommunityrecoverytest@gmail.com`, then go to **Admin → Users → Send Invite** and add your own email (satisfies the `Admin`-table gate). Separately, sign in to [console.cloud.google.com](https://console.cloud.google.com) with `ithacacommunityrecoverytest@gmail.com` and add your own email under **OAuth consent screen → Test users** on the dev Google Cloud project (satisfies the Google-side gate). Only once both are done can you sign into the app with your own email.

**Production:** there's no shared bootstrap account, and the first production Admin can't invite themselves — so the first Super Admin has to be created manually, satisfying both gates by hand:
1. Insert the first `Admin` row directly into the production database (e.g. `npx prisma studio` pointed at the production `DATABASE_URL`, or MongoDB Compass) with `role: SUPER_ADMIN` and their email.
2. Add that same email under the production Google Cloud project's **OAuth consent screen → Test users** — production is still External/unverified today (step 6 above) until the User Type is switched to Internal.

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

## 4. Google Calendar API

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
3. No separate service-account credentials are needed — calls use the signed-in admin's own OAuth token (`calendar.events` scope, requested at login — see section 3). This means **each of these three calendars must be individually shared with every Google account that needs to create/edit/delete meetings**, with at least "Make changes to events" permission (Calendar Settings → "Share with specific people" → their Google account → permission level). Being an app `Admin`/`SUPER_ADMIN` and being able to write to these calendars are two separate, unsynced permission systems — an admin can pass every in-app gate and still get silent GCal sync failures (the ⚠ badge, see [user-guide.md, Section 4](../01-user-guide/user-guide.md#4-viewing-a-meeting)) if their Google account was never shared onto the relevant calendar(s).

### Key client code
`frontend/services/googleCalendar.ts` — `calendarIdForCategory`, `calendarIdsForMeeting`, `checkCalendarReachable`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`, `deleteCalendarOccurrence` (adds an EXDATE for a single recurring occurrence), `trimCalendarEventSeries` (trims a recurring event's RRULE `UNTIL`).

### Sync behavior
Sync is fail-soft: on failure, the meeting's `syncStatus` is set to `"error"` and a ⚠ badge appears in the UI; a Super/regular Admin can retry via `POST /api/update/meeting/sync`. Suspended meetings (`status: "Suspended"`) are skipped entirely — no calendar calls are made for them.

Sync also runs **after** the write/update/delete response is sent, not before — the route returns as soon as the MongoDB write succeeds, then syncs via `@vercel/functions`' `waitUntil()` in the background. Practical implication: the response body's `syncStatus`/`zoomSyncStatus` reflects the state *before* this sync attempt (usually `null` on a fresh create), not its outcome — the UI only sees the real result on a later fetch (page reload, re-navigating the day). `POST /api/update/meeting/sync` (the manual retry route) is the one exception — it stays synchronous, since a user clicking "Retry sync" expects an immediate result. See [technical-decisions.md](../02-handoff/technical-decisions.md#google-calendar-sync) for why (`waitUntil` is a workaround for this Next.js version lacking `after()`, not the long-term answer).

---

## 5. Zoom API

### What it does
Creates/updates/deletes a real Zoom meeting whenever a meeting has a `zoomRoom` set, then publishes the join link to that room's own Google Calendar as the event's `location` (which Zoom Room hardware uses for one-touch join detection). See [technical-decisions.md](../02-handoff/technical-decisions.md#zoom-integration) for the full design, the per-room-host rationale, and a timezone gotcha worth reading before touching this code.

### Zoom App setup

1. Go to [marketplace.zoom.us](https://marketplace.zoom.us) → **Develop** → **Build App** → **Server-to-Server OAuth**.
2. Fill in app name and description, activate the app.
3. Under **Scopes**, add: `meeting:write:admin`, `meeting:read:admin`, `meeting:update:admin`, `meeting:delete:admin`, and `user:read:list_users:admin` (needed to look up which licensed users exist on the account when confirming the host pool emails below).
4. Copy **Account ID**, **Client ID**, **Client Secret** → `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`.

### Host pool setup

ICR's licensed Zoom users are a **shared pool**, not tied to any one room — each can host only one meeting at a time. When a meeting needs a live Zoom meeting, the app picks the first host in `ZOOM_HOSTS` (comma-separated, order matters only as a tiebreak) with no overlapping booking at that time — see `resolveZoomHost` in `frontend/services/zoom.ts` and `frontend/util/resourceOverlap.ts` for the availability check. The result is persisted immediately, in the same DB write as the meeting's create/update, to keep the gap between "checked available" and "claimed" as small as possible — this is a **best-effort** check, not an atomic reservation, so it doesn't fully rule out two simultaneous requests both claiming the same host. `createZoomMeeting` schedules under `POST /users/{host email}/meetings`, not `/users/me/meetings` — Zoom's `userId` path param accepts an email directly.

If every host is busy when a meeting is created, that meeting is still saved (no Zoom meeting attached) with `zoomSyncStatus: "error"` and a `zoomSyncError` message — the admin can retry once a host frees up (via the meeting detail panel's "Retry sync" button, or by re-running `POST /api/update/meeting/sync`). An existing recurring meeting keeps its assigned host across edits as long as its Zoom meeting doesn't need to be torn down — the pool is only re-consulted when a meeting gets its first Zoom meeting, or when its room changes (a Zoom meeting can't move rooms, so the old one is deleted and a new host resolved).

### Per-room setup

Each of the 5 Zoom-enabled rooms still needs **a Google Calendar dedicated to that room** (separate from the 3 category calendars in section 4) — set its ID as `GOOGLE_CALENDAR_ZOOM_<ROOM>`. This calendar must be shared with whatever Google account the signed-in admin uses (same sharing requirement as section 4), and it must be the calendar that room's physical Zoom Room hardware is actually configured to read from in Zoom's admin console — confirm this with whoever manages the Zoom account, since hardware can be pointed at a different (e.g. legacy) calendar than the one the app writes to.

Room slugs match `zoomRoomOptions` in `frontend/util/rooms.ts`: `SERENITY_ROOM`, `SEEDS_OF_HOPE_ROOM`, `UNITY_ROOM`, `ROOM_FOR_IMPROVEMENT`, `CHILDRENS_ROOM_518`.

### Key client code
`frontend/services/zoom.ts` — `checkZoomReachable`, `checkZoomHostPool`, `resolveZoomHost(candidate, opts)`, `createZoomMeeting(meeting, hostEmail)`, `updateZoomMeeting(zid, meeting)`, `deleteZoomMeeting(zid)`, plus the `zoomRoomCalendarId` and `zoomHostPool` lookup values. Called directly from the meeting routes (`write`, `update`, `delete`, `update/meeting/sync`, `import`) — there's no separate `/api/zoom/*` HTTP surface.

Every call first fetches a fresh token (posts to `https://zoom.us/oauth/token`, `grant_type=account_credentials`) — the token is short-lived and not cached.

### Verifying it's working
`GET /api/admin/diagnostics` covers three levels: `zoom.reachable` is an account-level token fetch, `zoom.roomCalendars.<room>` checks each room's dedicated Google Calendar is reachable, and `zoom.hostPool.<email>` checks each pooled host — `ok` (the email resolves to a real user on the account) and `licensed` (`false` flags a Basic-type host, which caps meetings at 40 minutes — a likely cause if meetings assigned to that host keep cutting off). The Diagnostics tab on `/admin` surfaces all of this, plus a **Conflicts** panel listing any meetings sharing a room or Zoom Room at overlapping times.

To confirm a room end-to-end beyond what Diagnostics checks: create a real meeting in the app with that room selected, then check that (a) the meeting shows a join link and (b) that room's Google Calendar has a new event with the join link in its `location` field.

---

## 6. PandaDocs / Lease Export

### What it does
The Export tab's "Export Lease CSV" button generates a CSV formatted for PandaDocs' Bulk Send feature, covering every `status: "Active"` meeting. ICR uploads this CSV to PandaDocs to send annual lease documents to all groups at once.

### Configuring rates and lease details
No code changes needed. In the app: **Admin → Export → (⋮ on the lease card) → Configure export…**, which opens a modal to set the lease period, per-room rate + unit (`/hr` or `/month`), rental agent contact info, and the email message template (`{group}` placeholder). This is stored in the `LeaseSettings` singleton via `GET/PUT /api/retrieve|update/lease-settings`. Until someone saves settings, `frontend/util/leaseDefaults.ts` supplies ICR's current defaults.

### Uploading to PandaDocs
1. Export the CSV from **Admin → Export**.
2. In PandaDocs, go to **Bulk Send** → upload the CSV → select the lease template → send.

---

## 7. Vercel Deployment

### Initial setup

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the GitHub repo.
3. Set the **Root Directory** to `frontend/`.
4. Set the **Build Command** to `npx prisma generate && next build`.
5. Add all environment variables from section 1 under **Project Settings → Environment Variables**, including production values for `NEXTAUTH_URL` and the Google OAuth redirect URI (section 3).
6. Deploy.

### Subsequent deploys
Every push to `master` triggers an automatic production deployment. Every pull request gets a preview deployment URL.

### Build command
The build runs `prisma generate` before `next build` to ensure the Prisma client is generated from the current schema. This is set in `frontend/package.json`:
```json
"build": "prisma generate && next build"
```

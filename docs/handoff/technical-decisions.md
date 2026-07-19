# Technical Decisions

This document answers "why did we build it this way?" for every significant technical choice in the ICR admin platform. Read this before proposing changes to the stack or architecture.

---

## Framework: Next.js App Router (full-stack)

**Decision:** Use Next.js 14 with the App Router as both the frontend framework and the API layer, rather than a separate frontend + Express backend.

**Why:**
- The previous tech lead established this pattern. Migrating to a separate Express backend is listed as a non-priority option in the PRD if routing performance becomes an issue.
- Next.js Route Handlers run server-side and support direct Prisma calls without an extra network hop.
- Vercel (our host) is built for Next.js — zero-config CI/CD, automatic preview deployments, and serverless function scaling.

**Trade-offs:**
- All API routes are serverless functions. Each request may spin up a cold instance, which adds latency on the first hit, and there's no persistent in-memory state between requests — anything that needs to survive across requests goes in MongoDB or the NextAuth session JWT.
- The `frontend/` directory contains both UI and backend code, which is non-standard and can be confusing.

---

## Database: MongoDB + Prisma

**Decision:** MongoDB as the database, accessed through Prisma ORM.

**Why MongoDB:**
- Meeting data is loosely structured (optional Zoom fields, optional recurrence, varying room types). A document store handles optional/nullable fields naturally without schema migrations every time a field is added.
- ICR is a small-scale app — we don't have relational query complexity that would require PostgreSQL.

**Why Prisma over Mongoose:**
- Prisma generates TypeScript types from the schema, giving end-to-end type safety from the database model to the API response.
- Mongoose is also installed as a dependency but is not used — Prisma was chosen and Mongoose was never removed.

**Trade-offs:**
- Prisma's MongoDB support is more limited than its PostgreSQL support (no raw query support, no full-text search). For this use case (simple CRUD on meetings and admins) that limitation shouldn't matter.
- The `RecurrencePattern` model uses a 1-to-1 relation with `Meeting` via a shared `mid` field. Prisma handles this cleanly, but direct MongoDB queries (bypassing Prisma) need to be aware of this join.

---

## Authentication: NextAuth + Google OAuth 2.0 / OIDC

**Decision:** Use NextAuth (`next-auth` 4) with the Google provider for authentication, rather than a custom OAuth client.

**Why:**
- NextAuth owns session/JWT handling, token refresh, and cookie management out of the box — no custom token-cache infrastructure to build or operate.
- ICR board members already have Google accounts, and the same token exchange covers both identity and API access: the `openid email profile` scopes are OpenID Connect (OIDC — an identity layer built on top of OAuth 2.0) and establish who signed in, while the `calendar.events` scope is plain OAuth 2.0 authorization, letting the server call Google Calendar on that admin's behalf. One sign-in, one token exchange, both jobs.

**Invite-only sign-in:** the `signIn` callback (`frontend/app/api/auth/authConfig.ts`) rejects any email that isn't already a row in the `Admin` table — there's no self-registration flow. A Super Admin adds someone via the Users tab (`POST /api/write/admin`) before that person can ever sign in. Role is re-read from the DB on every token refresh (not just at login), so revoking access takes effect without waiting for the session to expire.

**Notes:**
- The `calendar.events` OAuth scope is sensitive, which puts the app's Google Cloud OAuth consent screen in "unverified" status (100-test-user cap, warning banner, manual test-user allowlisting) unless the consent screen's User Type is switched to **Internal**.

---

## Google Calendar Sync

**Decision:** MongoDB is the single source of truth for meeting data; Google Calendar is a downstream display layer only. Changes flow app → Google Calendar in one direction. There is no reverse sync pulling edits made directly in Google Calendar back into MongoDB.

**Why:**
- A bidirectional sync needs conflict resolution (what happens when the same meeting is edited in both places) that isn't worth the complexity for this app's scale. One-way publishing is simpler to reason about and debug.
- Each of the three meeting categories (AA, Al-Anon, Other) publishes to its own Google Calendar, configured via `GOOGLE_CALENDAR_AA` / `GOOGLE_CALENDAR_ALANON` / `GOOGLE_CALENDAR_OTHER`. A meeting with more than one category publishes an event to each of that meeting's calendars.
- Sync is fail-soft: a Google Calendar API failure sets `syncStatus: "error"` on the meeting (surfaced as a ⚠ badge in the UI, with a manual retry endpoint) rather than failing the write to MongoDB.

---

## Zoom Integration

**Decision:** Each of ICR's 5 Zoom-enabled rooms gets its own licensed Zoom host account and its own Google Calendar (separate from the 3 category calendars). Creating/updating/deleting a meeting calls the Zoom API directly (Server-to-Server OAuth, account-credentials grant) under that room's host, then publishes the join link to that room's calendar as the event's `location` field.

**Why:**
- Zoom cannot host two simultaneous meetings under one account. ICR provisioned 5 separate licensed users up front for exactly this reason — one per room — so `services/zoom.ts` schedules under `POST /users/{room's host email}/meetings` rather than a single shared account.
- The physical Zoom Room hardware has no Zoom-native "Room Calendar" resource here — each room's calendar in Zoom's admin console is actually a Google Calendar. There's no Google Workspace add-on that auto-creates a Zoom meeting from a calendar event, so the app calls the Zoom API itself and writes the result into that calendar. Zoom Room hardware detects a joinable meeting from the event's **`location`** field specifically.
- Recurring meetings get one stable Zoom meeting (`type: 2`) created at the series' first occurrence, reused for every future instance — occurrence-level deletes (`this` / `thisAndFollowing`) leave it untouched; only a whole-series delete or room reassignment touches Zoom.
- Zoom sync (`zoomSyncStatus`) is tracked independently from Google Calendar category sync (`syncStatus`) — the two can succeed or fail independently, same fail-soft pattern as the rest of the app.

**A trap worth knowing about:** Zoom silently ignores the `timezone` field on create/update whenever `start_time` ends in `Z` (a UTC ISO string) — which is what `Date.toISOString()` always produces. `services/zoom.ts`'s `toZoomStartTime()` works around this by formatting the UTC `Date` as Eastern *wall-clock* time (no `Z` suffix) before sending it, alongside `timezone: "America/New_York"`. Any future change to how the start time is built needs to preserve this, or meetings will silently schedule at the wrong hour.

Diagnostics (`GET /api/admin/diagnostics`, surfaced on `/admin`) checks each room's host individually — not just that a Zoom meeting *can* be created somewhere, but that the specific email in `ZOOM_HOST_<ROOM>` resolves to a real, Licensed user. A host downgraded to Basic (a 40-minute meeting cap) or a typo'd/removed host email would otherwise only surface indirectly, as a failed `zoomSyncStatus` on whatever meeting happens to get booked into that room next.

**Trade-offs:**
- Token generation happens on every Zoom API call (no token is cached). Fine at ICR's scale; would need caching if call volume grew significantly.
- 5 separate licensed Zoom seats is a real recurring cost, in exchange for guaranteed non-conflicting concurrent meetings. We did consider a single shared account with a "is this account free" check was considered and rejected as added complexity not worth it for 5 rooms.

---

## Leasing Documents: DB-configured CSV Export

**Decision:** The Export tab's "Export Lease CSV" button exports a CSV file rather than calling the PandaDocs API directly, and its inputs (lease period, per-room rates, agent contact, email template) are stored in a `LeaseSettings` singleton document rather than hardcoded in a component.

**Why:**
- PandaDocs has a bulk-send feature that accepts a CSV to generate multiple lease documents at once. The workflow is: export CSV from the platform → upload to PandaDocs → PandaDocs sends leases to groups.
- A direct PandaDocs API integration was considered and rejected — it would require a higher-tier PandaDocs account, raising operational cost for no clear benefit at ICR's scale.
- Moving the rate/contact/template values into `LeaseSettings` (configurable via a modal on the Export tab) means a rate change no longer requires a code deploy — a Super Admin edits it directly.

**What the CSV contains:** one row per `status: "Active"` meeting, with group name, contact email, room + rate, billable hours, lease dates, and the configured email message template (`{group}` placeholder filled in per row).

**Trade-offs:**
- The manual upload-to-PandaDocs step is still a friction point. A future team should evaluate whether the PandaDocs API is worth integrating directly. There apparently is a Free tier for PandaDocs API. https://www.pandadoc.com/developer-api/pricing/

---

## Hosting: Vercel

**Decision:** Deploy the Next.js app on Vercel.

**Why:**
- Vercel has zero-config Next.js support: automatic builds on push to `master`, preview deployments for PRs, and serverless function execution for API routes.
- No Docker or server management required.

**Trade-offs:**
- Vercel's free tier has function execution time limits (10s per invocation). Long-running operations (e.g., bulk calendar sync) may need to be broken into smaller requests or moved to a background job.

# Technical Decisions

This document answers "why did we build it this way?" for every significant technical choice in the ICR admin platform. Read this before proposing changes to the stack or architecture.

---

## Framework: Next.js App Router (full-stack)

**Decision:** Use Next.js 16 with the App Router as both the frontend framework and the API layer, rather than a separate frontend + Express backend.

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

**Client instantiation:** all API routes import a shared singleton (`frontend/lib/prisma.ts`) rather than each constructing its own `new PrismaClient()`. Every route used to do the latter, risking connection-pool exhaustion under concurrent load — the singleton also survives Next.js dev-mode hot reload without spawning a fresh client per reload, via a `globalThis` cache guarded by `NODE_ENV !== "production"`.

---

## Authentication: NextAuth + Google OAuth 2.0 / OIDC

**Decision:** Use NextAuth (`next-auth` 4) with the Google provider for authentication, rather than a custom OAuth client.

**Why:**
- NextAuth owns session/JWT handling, token refresh, and cookie management out of the box — no custom token-cache infrastructure to build or operate.
- ICR board members already have Google accounts, and the same token exchange covers both identity and API access: the `openid email profile` scopes are OpenID Connect (OIDC — an identity layer built on top of OAuth 2.0) and establish who signed in, while the `calendar.events` scope is plain OAuth 2.0 authorization, letting the server call Google Calendar on that admin's behalf. One sign-in, one token exchange, both jobs.

**Invite-only sign-in:** the `signIn` callback (`frontend/app/api/auth/authConfig.ts`) rejects any email that isn't already a row in the `Admin` table — there's no self-registration flow. A Super Admin adds someone via the Users tab (`POST /api/write/admin`) before that person can ever sign in. Role is re-read from the DB on every token refresh (not just at login), so revoking access takes effect without waiting for the session to expire.

**Notes:**
- The `calendar.events` OAuth scope is sensitive, which puts the app's Google Cloud OAuth consent screen in "unverified" status (100-test-user cap, warning banner, manual test-user allowlisting) unless the consent screen's User Type is switched to **Internal**.

**Token refresh is persisted in the proxy, not in route handlers:** `services/auth.ts`'s `getAuth()` calls `getServerSession(authOptions)` with a single argument — next-auth v4's "RSC" code path, which uses a stub response object whose `setCookie()` is a no-op. So a route handler refreshing the Google access token via that path can never actually write the refreshed value back to the session cookie; every subsequent request would see the same stale, soon-to-expire token and refresh again, forever. `frontend/proxy.ts` owns the fix instead (renamed from `middleware.ts` per Next 16's `proxy` file convention — same Edge Middleware mechanism, new name): it decodes the session JWT via `getToken()`, and if the access token is within 60 seconds of expiring, calls `services/googleTokenRefresh.ts`'s `refreshGoogleAccessToken()` (extracted out of `authConfig.ts`'s `jwt` callback so it has no Prisma dependency and can run on Edge middleware) and re-encodes/persists the result onto the response cookie via `next-auth/jwt`'s `encode()`. `proxy.ts`'s matcher excludes NextAuth's own handler (`/api/auth/*`, which manages its own cookies correctly through its real route) plus Next internals (`/_next/*`, `/favicon.ico`) — everything else, including non-API page routes, goes through it. `authConfig.ts`'s `jwt` callback still calls the same refresh helper as a fallback for the one request that actually crosses the expiry threshold — that request's own downstream refresh is redundant but harmless, since the proxy has already persisted a fresh cookie for every request after it.

---

## Google Calendar Sync

**Decision:** MongoDB is the single source of truth for meeting data; Google Calendar is a downstream display layer only. Changes flow app → Google Calendar in one direction. There is no reverse sync pulling edits made directly in Google Calendar back into MongoDB.

**Why:**
- A bidirectional sync needs conflict resolution (what happens when the same meeting is edited in both places) that isn't worth the complexity for this app's scale. One-way publishing is simpler to reason about and debug.
- Each of the three meeting categories (AA, Al-Anon, Other) publishes to its own Google Calendar, configured via `GOOGLE_CALENDAR_AA` / `GOOGLE_CALENDAR_ALANON` / `GOOGLE_CALENDAR_OTHER`. A meeting with more than one category publishes an event to each of that meeting's calendars.
- Sync is fail-soft: a Google Calendar API failure sets `syncStatus: "error"` on the meeting (surfaced as a ⚠ badge in the UI, with a manual retry endpoint) rather than failing the write to MongoDB.
- Sync also runs *after* the write/update/delete response is sent, not before it — the route returns as soon as the MongoDB write succeeds, and calendar/Zoom sync happens afterward via Next's native `after()` (`next/server`). This was `@vercel/functions`' `waitUntil()` until the app moved to Next 16, which ships `after()` natively — same behavior, one fewer dependency. `POST /api/update/meeting/sync` (the manual retry route) deliberately stays synchronous, since a user clicking "Retry sync" expects an immediate result rather than a background one.

---

## Zoom Integration

**Decision:** ICR's licensed Zoom users are a shared host pool (`ZOOM_HOSTS`, comma-separated emails), not tied to any particular room. Each of ICR's 5 Zoom-enabled rooms still has its own Google Calendar (separate from the 3 category calendars), used only to publish the join link — room and host are two independent resources. Creating a meeting resolves an available host from the pool first, then calls the Zoom API directly (Server-to-Server OAuth, account-credentials grant) under that host, then publishes the join link to the room's calendar as the event's `location` field.

**Why:**
- A single Zoom host/user can only host one meeting at a time (multiple licensed hosts under the same account can of course host concurrently — that's the whole reason the pool has more than one entry), so every new Zoom-enabled meeting needs an *available* host, not just any host. `services/zoom.ts`'s `resolveZoomHost` checks the pool in list order against a shared, recurrence-aware overlap utility (`util/resourceOverlap.ts`) — also reused by the Diagnostics Conflicts panel and XLSX import's per-row conflict flagging — and returns the first host with no overlapping meeting. `createZoomMeeting` itself is host-agnostic (takes a resolved host email, not a room). `write`/`update` meeting routes resolve a host and persist it in the same initial DB write, immediately, rather than inside the deferred GCal/Zoom sync job — this shrinks the window between "checked free" and "committed to this meeting" down to a single DB round trip, but it is **not** a full atomic reservation: two truly concurrent requests can still interleave between the conflict check and the write and both claim the same host. XLSX import handles this differently, by claiming hosts in memory as it walks the batch sequentially (see below) rather than relying on separate DB writes per row.
- Pool exhaustion fails soft: the meeting is still saved, with `zoomSyncStatus: "error"` and a `zoomSyncError` message, retryable the same way any other sync failure already is. An **existing** recurring meeting's host is only re-resolved when its Zoom meeting has to be torn down and recreated — i.e. the meeting never had one yet, or its room changed (a Zoom meeting can't move rooms). A same-room edit to an already-Zoom-enabled meeting keeps its assigned host and only re-checks that it's still free at the (possibly new) time.
- The physical Zoom Room hardware has no Zoom-native "Room Calendar" resource here — each room's calendar in Zoom's admin console is actually a Google Calendar. There's no Google Workspace add-on that auto-creates a Zoom meeting from a calendar event, so the app calls the Zoom API itself and writes the result into that calendar. Zoom Room hardware detects a joinable meeting from the event's **`location`** field specifically. This calendar-per-room mapping (`zoomRoomCalendarId`) is unrelated to host assignment and stays fixed per room.
- Recurring meetings get one stable Zoom meeting (`type: 2`) created at the series' first occurrence, reused for every future instance — occurrence-level deletes (`this` / `thisAndFollowing`) leave it untouched; only a whole-series delete or room reassignment touches Zoom.
- Zoom sync (`zoomSyncStatus`) is tracked independently from Google Calendar category sync (`syncStatus`) — the two can succeed or fail independently, same fail-soft pattern as the rest of the app.

**A trap worth knowing about:** Zoom silently ignores the `timezone` field on create/update whenever `start_time` ends in `Z` (a UTC ISO string) — which is what `Date.toISOString()` always produces. `services/zoom.ts`'s `toZoomStartTime()` works around this by formatting the UTC `Date` as Eastern *wall-clock* time (no `Z` suffix) before sending it, alongside `timezone: "America/New_York"`. Any future change to how the start time is built needs to preserve this, or meetings will silently schedule at the wrong hour.

Diagnostics (`GET /api/admin/diagnostics`, surfaced on `/admin`) checks room calendars and pooled hosts separately: each room's `zoomRoomCalendarId` reachability, and each pooled host's resolvability + Licensed status (`checkZoomHostPool()`). A host downgraded to Basic (a 40-minute meeting cap) or a typo'd/removed host email would otherwise only surface indirectly, as a failed `zoomSyncStatus` on whatever meeting happens to get assigned that host next.

**Trade-offs:**
- Token generation happens on every Zoom API call (no token is cached). Fine at ICR's scale; would need caching if call volume grew significantly.
- 5 separate licensed Zoom seats is a real recurring cost, in exchange for the pool being able to cover concurrent meetings at all. A single shared account was also considered and rejected — even less concurrency headroom for the same "is this account free" check.
- Host overlap checking is bounded to a 2-year recurrence horizon (`OVERLAP_HORIZON_YEARS` in `util/resourceOverlap.ts`) rather than truly unbounded, since a `type: 2` Zoom meeting is reused forever across every future occurrence. A collision more than 2 years out is an accepted residual gap, caught later by Diagnostics' own periodic scan.

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

## Testing Strategy: Playwright-primary, Jest for narrower jobs

**Decision:** Playwright for E2E (the bulk of the suite), Jest for two narrower jobs — pure-function unit tests and route-handler integration tests that need precise mocked-timing control. Not a single framework for everything.

**Why:**
- Most of this app's complexity lives in UI wiring and route orchestration, not in isolable pure functions, so E2E carries the most weight (68 e2e vs. 23 unit vs. 3 integration tests as of the initial build). Playwright driving a real browser against a real spawned `next dev` server catches what unit/integration tests structurally can't — a broken click handler, a locator that silently stops matching, a race between two rapid clicks (this is exactly how the double-click duplicate-meeting bug was caught).
- `package.json` already listed unused `@jest/globals`/`@testing-library/react` deps before this suite existed — Jest reuses that intent for unit/integration rather than adding a third framework.

**Auth in tests:** no dev-login bypass was added. Tests mint a real `next-auth.session-token` JWT directly (`next-auth/jwt`'s `encode()` with `NEXTAUTH_SECRET`) and inject it via Playwright's `context.addCookies()`. This works cleanly because of how the `jwt` callback is written (see Authentication above) — `role` is re-read from the `Admin` collection on every request, not baked into the token, so the minted token only needs `email`/`sub` to match a seeded `Admin` row.

**External services (Google Calendar, Zoom) in tests:** Playwright can't intercept server-side `fetch`/`googleapis` calls — they run in the Next.js server process, not the browser — so route interception was ruled out. Instead, the suite exploits the fail-soft sync gating described above (Google Calendar Sync, Zoom Integration) to reach deterministic states with **zero real network calls**: e.g. setting `zoomRoom` with no Zoom credentials configured deterministically produces `zoomSyncStatus: 'error'`. "Renders a successfully-synced meeting" assertions seed the end state directly rather than driving an actual successful sync, since those are rendering assertions, not integration assertions. This is also why CI's `e2e` job runs with no Google/Zoom secrets configured at all — the suite is built around the failure paths on purpose.

**Provisional tests:** features referenced in the manual QA script but not yet built (conflict detection, XLSX import, the suspend workflow's UI) get tests that lock in their *current* stub behavior rather than being skipped, tagged `@provisional-<ticket>` with a comment pointing at the exact stub line. The goal is that whoever ships the real feature finds the test immediately instead of it silently asserting the old absence of behavior forever.

**Trade-offs:**
- CI only runs Chromium (`projects: [{ name: "chromium" }]` in `config/playwright.config.ts`), and no automated tier touches real Zoom/Google credentials. Cross-browser rendering and live-credential behavior (a real Zoom meeting actually getting created, a real Google Calendar event actually appearing) are covered instead by a trimmed manual checklist (`docs/03-development/testing/manual-test-script-template.md`), not automation.
- `workers: 1` — the whole E2E run shares one in-memory Mongo replica set serially rather than one per worker. Fine at this suite's size; documented as a future step if parallelism is ever needed.

---

## Hosting: Vercel

**Decision:** Deploy the Next.js app on Vercel.

**Why:**
- Vercel has zero-config Next.js support: automatic builds on push to `master`, preview deployments for PRs, and serverless function execution for API routes.
- No Docker or server management required.

**Trade-offs:**
- Vercel's free tier has function execution time limits (10s per invocation). Long-running operations (e.g., bulk calendar sync) may need to be broken into smaller requests or moved to a background job — meeting write/update/delete's calendar sync was moved to a background `after()` call for exactly this reason (see [Google Calendar Sync](#google-calendar-sync) above); a future bulk operation (e.g. the XLSX import) may need the same treatment.

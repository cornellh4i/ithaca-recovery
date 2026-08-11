# Technical Decisions

This document answers "why did we build it this way?" for every significant technical choice in the ICR admin platform — including choices that were considered and rejected, since that reasoning isn't recoverable by reading the code. Read this before proposing changes to the stack or architecture.

Each section ends with a **Revisit if:** line — the condition under which this decision should be reopened, not just re-litigated on a whim.

---

## Framework: Next.js App Router (full-stack)

**Decision:** Use Next.js 16 with the App Router as both the frontend framework and the API layer, rather than a separate frontend + Express backend.

**Why:**
- The previous tech lead established this pattern; a separate Express backend was considered and explicitly deferred, not ruled out.
- Next.js Route Handlers run server-side and support direct Prisma calls without an extra network hop.
- Vercel (our host) is built for Next.js — zero-config CI/CD, automatic preview deployments, and serverless function scaling.

**Trade-offs:**
- All API routes are serverless functions: cold-start latency on the first hit, no persistent in-memory state between requests (anything that needs to survive goes in the database or the session JWT).
- The `frontend/` directory contains both UI and backend code, which is non-standard and can be confusing.

**Revisit if:** routing/serverless performance becomes a real problem — splitting out a separate Express backend is the PRD's documented fallback for that case, not a default direction.

---

## Database: PostgreSQL (Neon) + Prisma

**Decision (2026-08-06, superseded from MongoDB):** PostgreSQL, hosted on Neon, accessed through Prisma ORM. Originally MongoDB (rationale below, kept for history) — reversed while debugging a Diagnostics-panel bug caused by conflict detection living entirely in hand-rolled application code with no DB-level enforcement. A real exclusion constraint would make that whole bug class structurally impossible instead of something to keep patching field-by-field; Postgres was chosen specifically to make that available for future write-time integrity work (see "Write-Time Conflict Race" below for how that's actually used today).

**Why the switch was mechanically cheap:** Prisma already abstracted the ORM layer — 6 models, relations keyed by `mid`, zero raw MongoDB-driver usage or aggregation pipelines anywhere in application code. The conversion was a schema-provider swap plus fixing a `@db.Date` → `@db.Timestamptz` gotcha on `Meeting.startDateTime`/`endDateTime` (cosmetic under Mongo, a real midnight-truncation bug under Postgres), not a rewrite. Mongo's schemaless relations (`RecurrencePattern`/`SuspensionPeriod` → `Meeting` via `mid`, previously unenforced at the DB level) became real foreign keys as a side effect.

**Data migration:** dev and production data were migrated via a local, one-off export/transform/import script (per this project's no-committed-one-time-scripts convention). Production was confirmed pre-launch at migration time (a single admin account, no meeting data) — a full backfill/rollback procedure wasn't needed beyond the script's own guard against running against a non-empty target.

<details>
<summary>Original MongoDB rationale (superseded, kept for history)</summary>

> **Why MongoDB:**
> - Meeting data is loosely structured (optional Zoom fields, optional recurrence, varying room types). A document store handles optional/nullable fields naturally without schema migrations every time a field is added.
> - ICR is a small-scale app — we don't have relational query complexity that would require PostgreSQL.
>
> **Trade-offs (as understood at the time):**
> - Prisma's MongoDB support is more limited than its PostgreSQL support (no raw query support, no full-text search). For this use case (simple CRUD on meetings and admins) that limitation shouldn't matter.
> - The `RecurrencePattern` model uses a 1-to-1 relation with `Meeting` via a shared `mid` field. Prisma handles this cleanly, but direct MongoDB queries (bypassing Prisma) need to be aware of this join.

</details>

**Why Prisma:** generates TypeScript types from the schema, giving end-to-end type safety from the database model to the API response.

**Trade-offs:**
- The *direct* Postgres connection limit (scales with Neon compute size, and is the real constraint here) is much lower than what a burst of concurrent Vercel serverless invocations could open — Mongo Atlas didn't expose this the same way. The pooled Neon connection string (`-pooler` hostname, PgBouncer transaction-mode pooling) is what makes that viable; its own client-connection cap is high enough that it isn't the practical bottleneck. Vercel's serverless functions need the pooled string, not the direct one. (`frontend/lib/prisma.ts`'s singleton client and why it exists is explained in that file's own comment.)
- The `RecurrencePattern` model uses a 1-to-1 relation with `Meeting` via a real foreign key on a shared `mid` field (not Postgres's own primary key) — chosen to avoid a broader `id` migration across every relation at once; works cleanly with Prisma either way.

**Revisit if:** query complexity or scale ever genuinely outgrows what a small relational schema handles well — nothing on the horizon suggests this, but it's the condition that would justify reopening it.

---

## Write-Time Conflict Race: Advisory Locks, Not a DB Constraint

**Decision:** `write/meeting` and `update/meeting` wrap conflict checks and writes inside a single Prisma transaction, serialized by Postgres transaction-scoped advisory locks (`pg_advisory_xact_lock`) per resource (`frontend/util/meetings/resourceLocks.ts`).

**Why advisory locks over Postgres `EXCLUDE` constraints:**
- **Native constraints break override logic:** The app allows admins to intentionally save double-bookings via `ConflictOverrideModal`. `EXCLUDE USING gist` enforces hard invariants at database level and cannot support "warn, don't block."
- **Partial constraints create invisible rows:** A `WHERE (NOT overridden)` partial index was rejected. Marking a row `overridden` exempts it from *all* future conflict checks — making overridden meetings permanently invisible to subsequent bookings.
- **Advisory locks preserve check-then-write atomicity:** Locking per-resource (`room`, `zoomRoom`, `zoomHost`) prevents check-then-write race conditions without modifying database constraints. Overridden meetings are saved normally and remain visible to future conflict checks.

**Deadlock Prevention:** `lockResourceClaims` sorts requested lock keys into a deterministic order before acquisition to prevent concurrent multi-resource deadlocks.

**Zoom pool-auto-assignment closed the same way (fixed, was a Known TOCTOU Bug):** `resolveZoomHost` (used when no manual host is picked) used to be hoisted to run *before* any transaction opened, querying host availability via the global Prisma client outside the lock — the stated reason was that calling it inside an open interactive transaction would hold a second DB connection open per in-flight request, since it queried via the global client rather than the transaction's own. That justification held only because resolution ran on the global client; once it runs on `tx` instead, there's no second connection to avoid. Fixed (GitHub #360): `resolveZoomHost` now takes the transaction client directly, and `write/meeting`/`update/meeting`/`update/meeting/sync` lock every pool host (not just an explicit pick) in the same single `lockResourceClaims` call as room/zoomRoom, before resolving — closing the gap with the identical mechanism this section already describes, not a new one.

**Revisit if:** the "warn, don't block" double-booking policy is ever replaced with a hard block — at that point an `EXCLUDE` constraint (or a non-partial variant of one) becomes viable again and should probably replace this lock-based approach for simplicity.

---

## Authentication: NextAuth + Google OAuth 2.0 / OIDC

**Decision:** Use NextAuth (`next-auth` 4) with the Google provider for authentication, rather than a custom OAuth client.

**Why:**
- NextAuth owns session/JWT handling, token refresh, and cookie management out of the box — no custom token-cache infrastructure to build or operate.
- ICR board members already have Google accounts, and the same token exchange covers both identity and API access: the `openid email profile` scopes (OIDC, an identity layer on top of OAuth 2.0) establish who signed in, while the `calendar.events` scope is plain OAuth 2.0 authorization letting the server call Google Calendar on that admin's behalf. One sign-in, one token exchange, both jobs.

**Invite-only sign-in:** the `signIn` callback (`frontend/app/api/auth/authConfig.ts`) rejects any email that isn't already a row in the `Admin` table — there's no self-registration flow. Role is re-read from the DB on every token refresh (not just at login), so revoking access takes effect without waiting for the session to expire.

**Token refresh happens in `proxy.ts`, not in route handlers** — `services/auth.ts`'s single-argument `getServerSession()` call can't persist a refreshed token back to the cookie (its response object's cookie-write is a no-op), so a route handler alone would refresh the same soon-to-expire token on every request, forever. `frontend/proxy.ts` has real cookie-write access and owns the actual fix; see that file's own comments for the mechanism.

**Notes:**
- The `calendar.events` scope is sensitive, which keeps the Google Cloud OAuth consent screen in "unverified" status (100-test-user cap) while User Type is **External** — see [Integration Guides](../03-development/integration-guides.md#2-google-oauth-nextauth) for the day-to-day setup and bootstrapping steps.

**Revisit if:** prod's Google Cloud project moves under ICR's own Google Workspace org — at that point switching User Type to **Internal** removes the 100-user cap and test-user approval step entirely, with no code change required. Dev is expected to stay External/unverified regardless (its shared test account isn't on ICR's Workspace domain).

---

## Google Calendar Sync

**Decision:** The database (Postgres, originally MongoDB — see the Database section above) is the single source of truth for meeting data; Google Calendar is a downstream display layer only. Changes flow app → Google Calendar in one direction. There is no reverse sync pulling edits made directly in Google Calendar back into the database.

**Why:**
- A bidirectional sync needs conflict resolution (what happens when the same meeting is edited in both places) that isn't worth the complexity for this app's scale. One-way publishing is simpler to reason about and debug — this was a deliberate rejection of bidirectional sync, not an oversight.
- Each of the three meeting categories (AA, Al-Anon, Other) publishes to its own Google Calendar. A meeting with more than one category publishes an event to each of that meeting's calendars.
- Sync is fail-soft: a Google Calendar API failure sets `googleSyncStatus: "error"` on the meeting (surfaced as a ⚠ badge, with a manual retry endpoint) rather than failing the database write.
- Sync runs *after* the write/update/delete response is sent, via Next's native `after()` — the route returns as soon as the database write succeeds. `POST /api/update/meeting/sync` (manual retry) deliberately stays synchronous instead, since a user clicking "Retry sync" expects an immediate result.

**Revisit if:** ICR ever needs board members to edit meetings directly in Google Calendar and have that reflected back in the app — that would require designing the conflict-resolution behavior deliberately avoided above, not just flipping a sync direction.

---

## Zoom Integration

**Decision:** ICR's licensed Zoom users are a shared host pool (`ZOOM_HOSTS`), not tied to any particular room. Each of ICR's 5 Zoom-enabled rooms still has its own Google Calendar (separate from the 3 category calendars), used only to publish the join link — room and host are two independent resources. Creating a meeting resolves an available host from the pool first, then calls the Zoom API directly (Server-to-Server OAuth) under that host, then publishes the join link to the room's calendar as the event's `location` field.

**Why:**
- A single Zoom host can only host one meeting at a time, so every new Zoom-enabled meeting needs an *available* host, not just any host. `resolveZoomHost` (`services/zoom.ts`) checks the pool in list order against a shared overlap utility and returns the first host with no conflict. Both a manually-picked host and automatic pool assignment are locked and resolved inside the same advisory-lock-guarded transaction as the write (see "Write-Time Conflict Race" above) — pool assignment used to run before that transaction, unlocked, letting two concurrent requests double-book the same last-free host (closed as a TOCTOU race, GitHub #360, alongside the manual-pick/room/Zoom-Room fix this section already covers).
- Pool exhaustion fails soft: the meeting still saves, with `zoomSyncStatus: "error"`, retryable the same as any other sync failure.
- There's no Zoom-native "Room Calendar" resource here — each room's calendar in Zoom's admin console is actually a Google Calendar the app writes to directly, since there's no Google Workspace add-on that auto-creates a Zoom meeting from a calendar event. This calendar-per-room mapping is unrelated to host assignment and stays fixed per room.
- Recurring meetings get one stable Zoom meeting created at the series' first occurrence, reused for every future instance — only a whole-series delete or room reassignment touches Zoom.
- A single shared Zoom account (one login, many concurrent meetings) was also considered and rejected — it wouldn't have solved the "is this account free right now" problem the pool exists for; multiple licensed hosts under one account do.

**A trap worth knowing about:** see `services/zoom.ts`'s `toZoomStartTime()` and its comment — Zoom silently ignores the request's timezone under a specific condition that's easy to reintroduce by accident.

**Revisit if:** Zoom API call volume grows enough that generating a fresh token per call (never cached) becomes a real cost — fine at ICR's current scale. Also revisit the 2-year host-overlap horizon (`OVERLAP_HORIZON_YEARS`) if a real collision ever surfaces beyond that window; Diagnostics' periodic scan is the current backstop for that residual gap.

---

## Leasing Documents: DB-configured CSV Export

**Decision:** The Export tab's "Export Lease CSV" button exports a CSV file rather than calling the PandaDoc API directly, and its inputs (lease period, per-room rates, agent contact, email template) are stored in a `LeaseSettings` singleton rather than hardcoded in a component.

**Why:**
- PandaDoc's Bulk Send feature accepts a CSV to generate multiple lease documents at once — export from the platform, upload to PandaDoc, PandaDoc sends leases to groups.
- A direct PandaDoc API integration was considered and rejected — it would require a higher-tier PandaDoc account, raising operational cost for no clear benefit at ICR's scale.
- Moving rate/contact/template values into `LeaseSettings` means a rate change no longer requires a code deploy.

**What the CSV contains:** one row per non-deleted meeting — **not** filtered by `status`, deliberately: a suspended meeting's lease is still a legal obligation, it doesn't lapse just because the meeting is hidden from the calendar.

**Revisit if:** the manual upload-to-PandaDoc step becomes enough of a friction point to justify direct API integration — [PandaDoc has a free API tier](https://www.pandadoc.com/developer-api/pricing/), but that hasn't been evaluated against this app's actual usage.

---

## Toast/Banner Notification System

**Decision:** Replace every `alert()` call and ad-hoc inline error/info `<div>` with a shared `Toast` component (`frontend/app/components/shared/Toast.tsx` + `ToastProvider.tsx`) and, for the meeting form specifically, a dedicated `FormValidationBanner.tsx` — rather than component-local error state scattered across the codebase.

**Why a single shared component:** every meeting/admin action needed the same success/error feedback shape, previously implemented inconsistently — some as `alert()`, some as a one-off styled `<div>`, some as nothing at all (a failure only visible as a console error). One `ToastProvider`, mounted once, gives every part of the app the same `useToast().showToast(...)` call. `FormValidationBanner` is deliberately not a toast variant — it's a "list of specific fields, dismisses itself as they're fixed" behavior a corner-anchored toast doesn't fit.

Current variants, positioning, and persistence rules are defined in `Toast.tsx`/`ToastProvider.tsx` directly — read those rather than this doc for the specifics, since they're the kind of detail that drifts out of sync with prose.

**A gotcha worth knowing about:** `write/meeting`/`update/meeting`'s responses don't reflect the real Google/Zoom sync outcome (sync runs after the response, see Google Calendar Sync above) — so a naive success toast would fire regardless of whether sync actually worked. `services/syncMeeting.ts#pollMeetingSyncStatus` polls the meeting's own record for a few seconds afterward and fires a follow-up error toast if sync settles into an error state.

**Trade-offs:**
- Toast copy shouldn't repeat text already visible elsewhere on the page (e.g. an email already shown in an admin table row) — this isn't just a style preference, it caused a real Playwright strict-mode test failure (two elements matched one locator) when a toast echoed an email verbatim. Keep toast copy generic.

**Revisit if:** a hydration or portal-timing bug resurfaces in `ToastProvider` — the current mount-gating approach is explained in that file's own comment; don't re-derive a fix from scratch without reading it first.

---

## Admin-Gated "Mids" Pattern for Calendar Badges

**Decision:** When a calendar-block badge needs admin-only per-meeting data, back it with a dedicated admin-gated endpoint returning just a `Set` of matching meeting IDs (`{ mids: string[] }`) — never by adding the underlying field to the public meeting payload.

**Why:** `util/meetings/publicMeeting.ts`'s `PublicMeeting` type is a deliberate *allowlist* of fields safe to serve from the unauthenticated meeting-read routes — it intentionally excludes `googleSyncStatus`/`zoomSyncStatus`, since admin-only sync-failure data must not leak to an unauthenticated viewer even via the raw network response. Any calendar feature that reads a field not on that allowlist silently gets `undefined` — no error, just a value that's never there. This is exactly how the sync-error badge broke once: it computed its condition directly off `PublicMeeting` data that had never included the field, for every viewer including admins.

**Reference implementation:** the conflict badge — `/api/admin/conflict-mids` (`requireRole(Role.ADMIN)`), returning bare `{ mids: string[] }`; `hooks/useConflictMids.ts` fetches it and the UI checks `conflictMids.has(meeting.id)` at render time. The sync-error badge (`/api/admin/sync-error-mids` + `hooks/useSyncErrorMids.ts`) mirrors this shape exactly. Extend the same pattern for any future admin-only calendar-block indicator, rather than reopening `PublicMeeting`'s allowlist.

**Revisit if:** never, really — this is closer to a standing rule than a decision with a natural expiry. If you're about to add a field to `PublicMeeting` specifically to serve an admin-only UI element, that's the signal you're about to violate it.

---

## Testing Strategy: Playwright-primary, Jest for narrower jobs

**Decision:** Playwright for E2E (the bulk of the suite), Jest for two narrower jobs — pure-function unit tests and route-handler integration tests that need precise mocked-timing control. Not a single framework for everything.

**Why:**
- Most of this app's complexity lives in UI wiring and route orchestration, not isolable pure functions — E2E carries the most weight, and catches what unit/integration tests structurally can't (a broken click handler, a locator that silently stops matching, a race between two rapid clicks).
- `package.json` already listed unused `@jest/globals`/`@testing-library/react` deps before this suite existed — Jest reuses that intent rather than adding a third framework.

**Auth in tests:** no dev-login bypass. Tests mint a real session JWT directly and inject it via Playwright's `context.addCookies()` — this works because `role` is re-read from the `Admin` table on every request (see Authentication above), not baked into the token, so the minted token only needs to match a seeded `Admin` row.

**External services (Google Calendar, Zoom) in tests:** Playwright can't intercept server-side `fetch`/`googleapis` calls, so route interception isn't an option. Instead, the suite exploits the app's own fail-soft sync gating to reach deterministic states with **zero real network calls** — e.g. setting `zoomRoom` with no Zoom credentials configured deterministically produces `zoomSyncStatus: 'error'`. This is also why CI's `e2e` job runs with no Google/Zoom secrets configured at all — the suite is built around the failure paths on purpose, not despite them.

**Provisional tests:** a feature referenced in the manual QA script but not yet built gets a test that locks in its *current* stub/absent behavior, tagged `[PROVISIONAL:<name>]` in `tests/e2e/provisional.spec.ts` with a comment pointing at the exact stub line — so whoever ships the real feature finds the test immediately instead of it silently asserting the old absence of behavior forever. A failure here means the feature landed, not a regression to revert. `provisional.spec.ts` is currently an empty shell — see that file's own comments for what was resolved and how.

**A fourth tier, not fully CI-enforced:** `tests/component/` (`yarn test:component`, Jest + React Testing Library, no server/database) covers individual components in isolation. It runs in CI as its own `component` job, but isn't yet in the branch protection's required-checks list (see [Deployment and Rollback](deployment-and-rollback.md) §1) — so a component-test regression can still merge with every *required* check green. Track closing that gap as a repo issue rather than here, so this document doesn't end up stating a stale "not done yet" indefinitely.

**Trade-offs:**
- CI only runs Chromium, and no automated tier touches real Zoom/Google credentials — covered instead by a manual checklist (`docs/03-development/testing/manual-test-script-template.md`).
- `workers: 1` — the whole E2E run shares one embedded Postgres instance serially rather than one per worker.

**Revisit if:** the `workers: 1` serial E2E run becomes a real bottleneck as the suite grows — parallelism is the documented next step, not yet needed at current size.

---

## Hosting: Vercel

**Decision:** Deploy the Next.js app on Vercel.

**Why:**
- Vercel has zero-config Next.js support: automatic builds on push to `master`, preview deployments for PRs, and serverless function execution for API routes.
- No Docker or server management required.

**Trade-offs:**
- Vercel's free tier has function execution time limits (10s per invocation) — meeting write/update/delete's calendar sync already moved to a background `after()` call for exactly this reason (see Google Calendar Sync above).

**Revisit if:** a future bulk operation needs more than 10s per invocation and can't be reasonably broken into smaller requests or backgrounded the same way.

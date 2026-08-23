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

## Timezone: Always Fixed Eastern Time, Never the Viewer's Local Zone

**Decision:** `Meeting.startDateTime`/`endDateTime` are stored as UTC instants (`@db.Timestamptz`, see above), but every display, calendar-day boundary, and recurrence calculation is done in fixed `America/New_York` — never the browser/runtime's local timezone. Ithaca Recovery is a physical-location calendar; a meeting's displayed time must not depend on where the viewer happens to be. All conversions go through the DST-safe `Intl.DateTimeFormat`-based helpers in `frontend/util/date/timeUtils.ts` (and `timeFormat.tsx` for compositions on top).

**Enforcement:** this used to rely on every contributor remembering to route through those helpers instead of calling local-timezone-dependent `Date` methods (`getDate`/`getHours`/`setDate`/`setHours`/direct `toLocaleDateString` calls/multi-arg `new Date(y, m, d)`) directly — which drifted in practice (three sibling calendar view components independently reimplemented the same "now" scroll-position math, one via the ET-safe path and the others via local getters). Now enforced two ways: a `no-restricted-syntax` ESLint rule (`frontend/config/eslint.config.mjs`) bans those patterns everywhere except `util/date/**` (where they're the legitimate low-level primitives), `tests/**`, and `scripts/**`; and `frontend/config/jest.config.ts`/`jest.component.config.ts` runs are pinned to `TZ=UTC` (mirroring `playwright.config.ts`'s existing `timezoneId: "UTC"`) so anything the lint rule can't catch still fails under a runtime zone that differs from Eastern. One deliberate exception: `MiniCalendar.tsx`/`DatePicker.tsx` use local Date getters/constructors on purpose (each with an inline `eslint-disable` + comment) where they're adapting to `react-day-picker`'s own local-semantics date values — reformatting those through ET would itself be a bug, not a fix.

**DST correctness:** `convertETToUTC` (the core ET→UTC conversion every helper above routes through) explicitly rejects two cases rather than silently miscalculating them: an ET wall-clock time that doesn't exist (the spring-forward gap, ~2:00–2:59 AM on the 2nd Sunday of March) throws, and a calendar-invalid date (e.g. Feb 30) throws. A fall-back-ambiguous time (~1:00–1:59 AM on the 1st Sunday of November, which occurs twice) resolves deterministically to the earlier/EDT occurrence, matching Java's `ZonedDateTime` default. Callers that can reach one of these (recurrence-occurrence expansion, the New/Edit Meeting form, the `day`/`week`/`range` retrieve routes) catch and handle it explicitly rather than letting it propagate as an unhandled 500 — see `isDstGapError`/`isConvertETToUTCValidationError` in `timeUtils.ts`.

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
- Production's User Type is **Internal** (sign-in restricted to ICR's Google Workspace accounts, no user cap or test-user step); dev stays External/unverified, where the sensitive `calendar.events` scope caps it at 100 manually-approved test users — see [Integration Guides](../03-development/integration-guides.md#2-google-oauth-nextauth).

**Revisit if:** an admin ever needs to sign in with a non-ICR-Workspace account — Internal blocks it; the fallback is switching production back to External and managing its Test users list.

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
- A Zoom host has finite concurrent capacity — **2 simultaneous meetings for a licensed (Business) user, 1 for a basic user** (Zoom's own account rules) — so every new Zoom-enabled meeting needs a host with *spare capacity*, not just any host. `resolveZoomHost` (`services/zoom.ts`) ranks the pool against a shared instant-level concurrency sweep (`findOverCapacityWindow`/`maxConcurrentDuring`, `util/meetings/resourceOverlap.ts`) as tiered least-connections: licensed hosts strictly before basic (a basic host silently caps meetings at 40 minutes), least-loaded within the tier (spreading shrinks the blast radius of a host outage or downgrade), pool list order as the deterministic tie-break. Capacity is resolved per host from live license status (`getZoomHostCapacities`, 12h in-memory TTL cache, fail-safe to 1 on unknown), resolved *before* the locked transaction so no Zoom API call runs while pool locks are held — a blanket capacity of 2 would silently double-book a host that ever downgrades to basic (GitHub #446). The TTL is deliberately not the downgrade guard: meetings are booked days ahead, so the guard for already-booked meetings is the Diagnostics pool-health card. Both a manually-picked host and automatic pool assignment are locked and resolved inside the same advisory-lock-guarded transaction as the write (see "Write-Time Conflict Race" above) — pool assignment used to run before that transaction, unlocked, letting two concurrent requests double-book the same last-free host (closed as a TOCTOU race, GitHub #360, alongside the manual-pick/room/Zoom-Room fix this section already covers). The capacity count widened that read-then-decide surface, so it stays inside the same locked transaction (#446).
- Pool exhaustion fails soft: the meeting still saves, with `zoomSyncStatus: "error"`, retryable the same as any other sync failure.
- There's no Zoom-native "Room Calendar" resource here — each room's calendar in Zoom's admin console is actually a Google Calendar the app writes to directly, since there's no Google Workspace add-on that auto-creates a Zoom meeting from a calendar event. This calendar-per-room mapping is unrelated to host assignment and stays fixed per room.
- Recurring meetings get one stable Zoom meeting for the whole series — a real recurring meeting (Zoom type 8) carrying the actual pattern, usually endless via `end_times: 0` (undocumented, but exactly what Zoom's own portal stores for its "no end" meetings; Zoom's PATCH path clamps it to a ~2-year rolling horizon that every subsequent edit re-extends). Its `start_time` is always the next *future* occurrence: Zoom silently rewrites a past start to "now" and files the meeting under the host's past meetings. Bounded series longer than Zoom's 50-occurrence cap still end on time — the app and calendars own the real schedule; Zoom's copy just under-shows the tail. Only a whole-series delete touches the Zoom meeting, and only when no other platform meeting still shares its `zid`; a schedule PATCH for a shared `zid` sends the union of every sharing row's weekdays (one Zoom meeting, one schedule), never a single row's narrowed view.
- **Adopted legacy Zoom meetings:** ICR's pre-platform meetings were pointed at (not recreated) in Aug 2026, preserving the meeting IDs/passcodes members have used for years, then converted in place from type 3 to type 8 (a Zoom PATCH changes the type while keeping ID, passcode, and join URL — verified empirically). Their historic Zoom names are pinned via `Meeting.zoomTopic`: when set, syncs send it verbatim; when null, the topic derives from the meeting's linked-schedule family (`buildLinkedScheduleLabel`, `util/meetings/linkedSchedules.ts`): a lone schedule gets `title + " - Hybrid"/" - Zoom Only"`, while a meeting run as two linked schedules gets one name covering both — `"One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat"` — carried identically by the shared Zoom meeting and by every member's Google Calendar event, so the two services can never drift apart. An app-side title edit can therefore never silently rename a Zoom meeting members recognize.
- **Host reassignment transfers in place** — a Zoom Host change PATCHes `schedule_for` onto the existing meeting, keeping its ID, passcode and join link (every sharing row's `zoomHost` follows it), and only falls back to tear-down-and-recreate when Zoom refuses the move (missing scheduling privilege, basic-tier host) on a meeting no other row shares.
- **A pure Zoom Room change moves in place too (GitHub #522)** — room and host are independent resources (above), so a managed meeting's Zoom Room change never touches the Zoom meeting itself: `zid`/link/passcode/host stay put, and only the join-link event moves — the old room's calendar event is deleted, a fresh one is created on the new room's calendar with the same stored link. Tear-down-and-recreate is reserved for a genuine host-can't-transfer reason (an explicit host change Zoom refused to move, or a shared-`zid` row whose host couldn't move); a room change bundled with one of those still recreates, same as before. The whole-series edit's synchronous host-resolution step no longer treats a room change as needing a new host either — only "never had a `zid`" or an explicit host change does.
- **`Meeting.zoomManaged = false`** marks the handful of meetings whose Zoom side ICR does not control (e.g. Noon Brown Baggers, owned by an outside account): the app syncs their calendars and keeps the stored link, but never creates, PATCHes, deletes, or auto-provisions anything on Zoom for them, and blocks host reassignment in the form. Everything ICR's own account owns — including adopted legacy meetings — stays `zoomManaged: true`.
- Two meetings sharing one licensed host is healthy and deliberately NOT flagged as a conflict anywhere (Diagnostics, calendar badges); only 3+ concurrent on one host is over-capacity, rendered as one N-way conflict row rather than pairs.
- A single shared Zoom account (one login, many concurrent meetings) was also considered and rejected — it wouldn't have solved the "is this account free right now" problem the pool exists for; multiple licensed hosts under one account do.

- **Credential drift (passcode/join URL):** these flow the *opposite* way from schedule — Zoom is their source of truth, the app only mirrors them. A portal-side passcode change rewrites `join_url`'s `?pwd=` with no signal to the app (our PATCHes never send a `password` field), silently stranding every published link while all statuses stay green. So: retry-sync *adopts* the live credentials before republishing (a pull — re-asserting the stored ones would fight whoever changed them); detection is a one-GET comparison at low-traffic points (an admin opening the meeting, via `/api/admin/zoom-drift/[mid]`) and deliberately **never** on the bulk calendar retrieve paths — per-meeting Zoom calls on the calendar hot path is the same shape of mistake as the uncached Conflicts endpoint that hit Vercel's 10s limit (#500).

**A trap worth knowing about:** see `services/zoom.ts`'s `toZoomStartTime()` and its comment — Zoom silently ignores the request's timezone under a specific condition that's easy to reintroduce by accident. Two Zoom lifecycle rules also matter operationally: a recurring meeting's link expires 365 days after its *last use* (a suspended-for-a-year meeting can lose its link), and the ~2-year type-8 horizon above only re-extends when a meeting is edited — a series untouched for two years needs an edit (or a future re-extension mechanism) before Zoom stops listing occurrences.

**Revisit if:** the per-instance token cache (`services/zoom.ts`) stops being sufficient — it's in-memory per warm function instance (this app runs on Vercel, which already spins up multiple concurrent instances today, not a hypothetical future scale-up), shared across requests handled by the same warm instance but not across instances, and lost on a cold start/recycle, so token fetches scale with instance count rather than request count. Fine at ICR's current traffic level; revisit if invocation volume grows enough to make that instance-count-driven fetch rate a real cost against Zoom's rate limit. Also revisit the 2-year host-overlap horizon (`OVERLAP_HORIZON_YEARS`) if a real collision ever surfaces beyond that window; Diagnostics' periodic scan is the current backstop for that residual gap.

---

## Recurring-Series Edit Scopes: Split Rows, Not an Exception Table

**Decision:** Editing a recurring meeting is scoped like deleting one — **This event**, **This and following events**, or **All events**. The two partial scopes reuse delete's existing series primitives on the parent (an `excludedDates` push for one occurrence, an `endDate` trim for a split) and put the edited values in a **new ordinary `Meeting` row**: a detached one-time row for "This event", a new series starting at the clicked occurrence for "This and following". `Meeting.splitFromMid` links every split-off row to its root series' `mid` (chains propagate the root, so one lineage shares one value). There is no per-occurrence override/exception table.

**Why:**
- Delete already encoded "remove one occurrence" and "end the series here" purely inside `RecurrencePattern` (`excludedDates`, trimmed `endDate`); every consumer (calendar expansion, conflict checking, Google Calendar EXDATE/UNTIL sync) already honors those. Reusing them means an edit-scope row is just a normal meeting to the rest of the system — no second code path through expansion, conflicts, or sync.
- Split-off rows **inherit the parent's Zoom meeting** (`zid`, link, passcode, host, `zoomManaged`, pinned topic) instead of provisioning a new one — members keep the link they know, and the shared-`zid` machinery (union schedule, schedule-neutral PATCH on divergence, last-row-standing delete guard) already governs multiple rows on one `zid`. Consistent with delete's contract: partial scopes never touch Zoom. A detached "This event" child (`isRecurring: false`) never counts toward the zid group's schedule-divergence signal (`retrieve/meeting/[id]`) either — a one-off occurrence has no representation in Zoom's single recurring schedule to diverge from, so it's excluded from that check while still appearing in the sibling list; a recurring "This and following" tail is a real weekly slot and still counts.
- On Google Calendar the parent's event(s) get a full-body rewrite (`events.update`) built from its post-write `RecurrencePattern` — `buildEventBody` (`services/googleCalendar.ts`) is the single place a pattern turns into a calendar body, and serializes both the RRULE (`endDate`/`UNTIL`) and every `excludedDates` entry as its own `EXDATE` line, so this one write reflects the trim/exclusion completely; delete's `'this'`/`'thisAndFollowing'` options use the identical mechanism. The new row gets its own events and sync statuses, so the standard per-meeting sync badges/retry apply to each half independently.
- The whole scoped write (parent trim/exclusion, conflict check of the new row, row creation) runs in one advisory-lock-guarded transaction, parent first, so the new row can't collide with occurrences the same edit just removed.
- `splitFromMid` exists chiefly for the lease export: a split series is one lease obligation, so the CSV bills each lineage once (see the leasing section below).
- Scope fields (`editScope`, `occurrenceDate`) are parsed by a separate schema from the shared meeting payload, so the create route can never absorb them.
- **Suspend keeps whole-series semantics only** — deliberately out of scope: suspension is already a soft "this and following" (trim + pre-created resume series), and removing a single occurrence exists via delete's "This event". Per-occurrence suspension would add a second exception mechanism for little gain.

**Revisit if:** ICR ever needs to edit a single occurrence *without* changing the members' join expectations breaking down — e.g. per-occurrence Zoom scheduling — which would require Zoom occurrence-level API support this model deliberately avoids; or if lineage chains grow long enough that "latest segment wins" stops being the right lease representative.

---

## Linked Meeting Modes: a `linkedToMid` Family, Not a Shared `zid`

**Decision:** A group that meets one way on some days and another way on others — Hybrid Monday-Friday plus Zoom Only on Saturday, the shape three ICR meetings have had for years — is **one meeting run as two schedules**, keyed by a new `Meeting.linkedToMid` column pointing at the family's anchor row. The family is capped at **two** schedules, which must differ in mode, never share a weekday, and always share a time of day, duration, interval and end condition. It is served by **one** Zoom meeting, named for both schedules (`buildLinkedScheduleLabel`, `util/meetings/linkedSchedules.ts`).

**Why:**
- **The pair is a Zoom constraint before it's a UX choice.** One Zoom meeting holds exactly one recurrence, so `buildZoomRecurrence` (`services/zoom.ts`) sends the *union* of the family's weekdays — which `isSharedZoomScheduleCompatible` only permits when every row agrees on interval, ET time of day and duration. A family it rejects degrades to a schedule-neutral PATCH: the admin's edit appears to save and quietly stops reaching Zoom. Hence the form locks those fields on the second schedule (derived server-side, never read from the request) rather than merely discouraging divergence, and the disjoint-weekday rule is enforced in the validator, not just the day picker — a day claimed twice would silently collapse into one occurrence.
- **`zid` can't be the family key**, even though the legacy pairs happen to share one. A family may contain an In-Person schedule, and an In-Person row must hold no `zid`/`zoomLink` at all: it would advertise a join link on an in-person meeting (in the UI and on its calendar events) and get its weekdays unioned into Zoom's schedule. A separate column also keeps the family distinct from `splitFromMid`'s chronological lineage (above) — the two are never both set, and a split child of a family member is created with `linkedToMid: null` so the family stays size 2 and its name doesn't grow a phantom segment. `zid` keeps answering what it's actually about: `sharedWith`/`zoomScheduleDiverged`, the recurrence union, and every teardown guard.
- **The family's name is one string across services.** Both the Zoom topic and *every* member's Google Calendar event title come from the same builder — `"One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat"` — in a fixed mode order, so the name is stable no matter which member triggered the write. A pinned `Meeting.zoomTopic` still short-circuits it (adopted legacy names are never touched), and a generated name is never written back into that column, so `null` keeps meaning "auto, recompute from the current family."
- **The second schedule consumes no additional Zoom host capacity** — it inherits the family's whole Zoom identity instead of provisioning its own. Only the In-Person-anchor case (an In-Person meeting gaining a Hybrid/Remote schedule) mints one, and that row becomes the family's `zid` holder while the anchor stays Zoom-free — precisely why the family isn't keyed on `zid`.
- **The second schedule is a bordered card in the recurrence slot, not inline fields.** Its Mode / Days / Room controls are the form's own components, but they render inside `MeetingSchedules.tsx`'s `.scheduleCard` rather than in the positions the meeting's own Mode and Room fields occupy. Chosen over inlining them: the two schedules use the *same* control set, so side-by-side unboxed copies would read as one form with duplicated fields, and there'd be nothing to attach the "Cancel" affordance or the inherited-time note to. It mirrors `RecurringMeeting.module.scss`'s own `.isRecurring` box — a peer of the meeting's schedule, not a nested sub-form.
- **Cap of two, enforced on both sides.** `canLinkSchedule` gates the form's "Add another mode" trigger and the API's rejection of a third from the same predicate. The generalization past two is real for the recurrence union and nothing else: the name hierarchy, the mutual-exclusion locking and the divergence copy are all written for a pair, and an API accepting a shape no UI can render or edit is a support burden.

**Deliberately out of scope:**
- **Three or more schedules.** See the cap above.
- **Editing an existing linked schedule's mode or days from the parent's form.** A linked schedule is an ordinary `Meeting` row with its own `mid`: an admin opens it from the calendar and edits it with the same form as any other meeting, and the existing `zoomScheduleDiverged` signal already reports it when such an edit breaks shared-schedule compatibility. The parent's form shows a read-only card, a link to that row, and Remove. Changing a linked schedule's mode in place is likewise remove-and-re-add.
- **Reconciling the two rows' shared identity fields after creation.** Title, description, email, group and `calType` are copied from the anchor at create time and drift freely afterward — each member's external name is built from its *own* title, so editing one row's title de-syncs the two events' names until both are rewritten. Nothing detects it; re-saving both with the same values is the fix.

**Revisit if:** ICR ever needs a third schedule on one meeting (Zoom's recurrence union already generalizes; the naming, locking and form flow would each need a pass), or if the create-time copy of the shared identity fields starts causing real confusion — the natural fix is a single submit that edits the anchor and its linked schedules together, which the update route currently refuses on purpose.

---

## Leasing Documents: DB-configured CSV Export

**Decision:** The Export tab's "Export Lease CSV" button exports a CSV file rather than calling the PandaDoc API directly, and its inputs (lease period, per-room rates, agent contact, email template) are stored in a `LeaseSettings` singleton rather than hardcoded in a component.

**Why:**
- PandaDoc's Bulk Send feature accepts a CSV to generate multiple lease documents at once — export from the platform, upload to PandaDoc, PandaDoc sends leases to groups.
- A direct PandaDoc API integration was considered and rejected — it would require a higher-tier PandaDoc account, raising operational cost for no clear benefit at ICR's scale.
- Moving rate/contact/template values into `LeaseSettings` means a rate change no longer requires a code deploy.

**What the CSV contains:** one row per non-deleted meeting lineage — rows created by scoped edits (`splitFromMid`) collapse into a single billing row per root series, represented by the latest-starting segment, so a split series never bills twice. **Not** filtered by `status`, deliberately: a suspended meeting's lease is still a legal obligation, it doesn't lapse just because the meeting is hidden from the calendar.

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

**Provisional tests:** a feature referenced in the manual QA script but not yet built gets a test that locks in its *current* stub/absent behavior, tagged `[PROVISIONAL:<name>]` in a `tests/e2e/provisional.spec.ts` file with a comment pointing at the exact stub line — so whoever ships the real feature finds the test immediately instead of it silently asserting the old absence of behavior forever. A failure here means the feature landed, not a regression to revert. The three features this pattern originally covered have all since been resolved (two shipped — conflict detection, suspend/resume — one canceled entirely — XLSX import), so `provisional.spec.ts` was deleted rather than kept around as an empty shell; recreate it the next time a manual-script feature needs this treatment.

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

---

## Backups: 3 Storage Targets via GitHub Actions, Satisfying 3-2-1-1-0

**Decision:** A GitHub Actions workflow dumps production Postgres 4×/day, verifies each dump via scratch-container restore, `age`-encrypts it, and
uploads to three storage targets: production GCS, archive GCS, and Cloudflare R2 with Object Lock. Details are documented in
[Backup Infra Setup](../03-development/backup-infra-setup.md).

**Why three targets:** Implements a strict 3-2-1-1-0 backup strategy (excluding Neon's built-in 6h PITR). Two GCS buckets provide offsite immutability across project boundaries, while R2 provides vendor diversity against Google account-level compromises. Operational restores use the primary GCS bucket; archive GCS (retention policy) and R2 (Object Lock) handle immutability.

**Why Governance, not Compliance, on R2's Object Lock:** Governance blocks write-only CI deletion while retaining a logged emergency override for account owners, avoiding permanent lockouts from fat-fingered retention dates in a volunteer team.

**Why the `age` private key stays out of CI entirely:** CI uses write-only IAM. Storing `age` private keys in CI—even as secrets—would allow a compromised public-repo pipeline to read 400 days of sensitive attendance data. Decryption is restricted to rare human-driven restores; CI verifies integrity via SHA256, CRC32C, and the in-run scratch restore.

**Revisit if:** 
- **Database Size > 1GB**: Free-tier limits and retention counts assume a ~33 MB database.
- **Compliance Mandates Change**: Current 400-day retention targets corruption detection, not formal record-retention requirements.

# Project Structure

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, full-stack TypeScript) |
| UI | React 19 + Material-UI 7 |
| Database | PostgreSQL (hosted on [Neon](https://neon.tech)) via Prisma ORM |
| Authentication | NextAuth with Google OAuth 2.0 + OpenID Connect (`next-auth` 4) |
| External APIs | Google Calendar API (`googleapis`), Zoom API (Server-to-Server OAuth, see [API Reference §Zoom](api-reference.md#zoom)) |
| XLSX | `xlsx` (SheetJS) — meeting export |
| Docs search | Pagefind (static-index search over `/docs`, see `app/(main)/docs/`) |
| Testing | Playwright (E2E), Jest + `@swc/jest` (unit/component/integration), `embedded-postgres` (with real `postgres` binary run as a plain child process) — see [Testing](testing/README.md) |

---

## Top-Level Layout

```text
ithaca-recovery/
├── frontend/          # Next.js application (all source code lives here)
│   ├── app/           # App Router — pages, API routes, components
│   ├── services/      # Backend services (auth, Google Calendar, Zoom, meeting sync)
│   ├── lib/           # Shared server-side singletons/helpers (Prisma client)
│   ├── hooks/         # Shared React hooks
│   ├── types/         # Shared TypeScript interfaces (models.ts)
│   ├── styles/        # Global SCSS (design tokens + app shell); per-component styles are
│   │                  #   colocated with their component under app/components/
│   ├── prisma/        # Prisma schema + migrations
│   ├── public/        # Static assets (svg/, favicon)
│   ├── config/        # jest/playwright/eslint/stylelint configs (next.config.mjs and
│   │                  #   tsconfig.json stay at the frontend/ root — both tools require that)
│   ├── tests/         # Playwright + Jest suite — see Testing section below
│   └── util/          # Domain-logic utilities, grouped into subfolders (see below)
├── docs/              # This documentation set — snapshotted at build/dev time into
│                      #   frontend/util/docs/docsContent.generated.ts (see util/ below), which
│                      #   backs the in-app /docs Resources page
└── .github/           # CI workflows + scripts (test.yml, codeql.yml, doc-freshness check, etc.)
```

---

## Frontend (`frontend/`)

### `app/` — App Router

```text
app/
├── (main)/                      # Route group: the live, authenticated app
│   ├── layout.tsx
│   ├── page.tsx                 # Home — calendar (Day/Week/mobile views)
│   ├── admin/page.tsx           # /admin — AdminShell
│   └── docs/[[...slug]]/        # /docs — Resources page (renders repo-root docs/, snapshotted
│                                 #   at build time — see util/docs/ below)
├── (auth)/
│   └── login/                   # /login — sign-in page
├── (signage)/                   # No auth check — renders fully logged out
│   └── signage/page.tsx         # /signage — read-only calendar for the lobby display
├── api/                         # All API route handlers (see api-reference.md)
├── context/                     # React context providers (CalendarProvider, SidebarContext)
├── components/
│   ├── ui/                      # Generic UI primitives, split by kind — see Component Hierarchy below
│   ├── calendar/                # desktop/, mobile/, shared/ — see Component Hierarchy below
│   ├── meeting-form/            # New/Edit/View meeting, recurrence, Zoom host field, suspend/resume
│   ├── admin/                   # AdminShell + diagnostics/, signage/, users/, export/, shared/ subfolders
│   ├── docs/                    # Renders the in-app /docs Resources page
│   ├── auth/                    # Sign-in/access-denied/profile UI — see Component Hierarchy below
│   ├── navigation/               # App-wide site chrome (desktop + mobile variants)
│   └── shared/                  # Cross-domain components (Toast/ToastProvider, FilterGroup)
└── ClientLayout.tsx             # Client-side layout wrapper — mounts SessionProvider,
                                 #   SidebarProvider, CalendarProvider, ToastProvider
```

### Pages

| Route | Purpose |
|---|---|
| `/` | Home — calendar (Day/Week, responsive mobile layouts) |
| `/admin` | Admin shell: Diagnostics, Signage, Users, Export tabs |
| `/docs` | In-app documentation (Resources page), Pagefind-searchable |
| `/login` | Sign-in |
| `/signage` | Read-only kiosk calendar for the physical display board |

### Component Hierarchy (by domain)

We group components by what they do (domain/feature) rather than how they compose (atomic design). The `ui/` folder is the only exception — holding generic primitives that every feature can share, split into sub-buckets by kind rather than kept as one flat folder.

**`ui/`** — generic, non-domain primitives, by kind:
- `buttons/` — `CheckButton`, `IconButton`, `TextButton`
- `inputs/` — `CheckBox`, `DayPicker` (the week's seven day toggles, shared by the recurrence
  editor and the linked-schedule form), `Dropdown`, `ModeTypeButtons` (a segmented value-selector,
  grouped here by function despite the "Buttons" name), `RadioGroup`, `SpinnerInput`, `TextField`
- `overlays/` — `BottomSheet`, `MobileFullScreenSheet`, `Modal`, `Tooltip`
- `pickers/` — `DatePicker`, `TimePicker`
- `displays/` — `BoxText`, `Icon`, `Logo`, `StatCounter`, `StatusPill`, `TagList`, `TopLoadingBar`

`Modal` is the shared accessible dialog primitive — dialog semantics (`role="dialog"`,
`aria-modal`), initial focus, Tab/Shift+Tab focus trapping, Escape dismissal, focus restoration,
and portal-to-`document.body`. Every confirm/dialog-style modal in the app (delete/suspend/resume
confirmations, conflict overrides, export configuration, the calendar's overlapping-meetings
picker, admin user management) is built on it rather than hand-rolling overlay markup; new
dialog-style modals should do the same. `BottomSheet` and `MobileFullScreenSheet` (the mobile
equivalents — New/Edit Meeting on phones, the mobile login sheet, and the various day-navigation/
filter/account sheets) get the identical focus-trap/Escape/restoration behavior via the same
shared `hooks/useDialogBehavior.ts` `Modal` itself is built on, not a separate implementation.
That hook also maintains a module-scope stack of currently-open dialogs so only the topmost one
responds to Escape — necessary because these dialogs portal as DOM siblings under
`document.body`, not nested in the tree, so a `Modal` opened from inside an already-open
`MobileFullScreenSheet` (e.g. a conflict-override dialog during New Meeting) can't rely on DOM
containment to know it's the "inner" one.

`Icon` is the name-based entry point (e.g. `<Icon name="warning" />`) for the app's icon set —
most render as `@mui/icons-material` glyphs tinted via `currentColor` from ambient CSS; a couple
of brand logos with no MUI equivalent (Google, Zoom) stay as local `public/svg/` assets.
`IconButton` wraps it for clickable icon-only buttons.

**`calendar/`** — `MiniCalendar` (a compact date-picker calendar, used from multiple contexts)
sits directly in `calendar/`, alongside three subfolders, not a flat list:
- `desktop/` — `CalendarNavbar`, `CalendarSidebar`, `CalendarSidebarShell`,
  `CompactCalendarSidebar`, `DailyViewRow`, `DayView`, `WeekView`
- `mobile/` — `DayLandscapeSwitcher`, `DayLandscapeView`, `DayPortraitView`, `MobileFab`,
  `MultiDayLandscapeView`, `WeekStrip`
- `shared/` — `CalendarHeader`, `DayColumn` (the day-to-meetings column mapping, reused by both
  desktop and mobile layouts), `MeetingsFilter`, `OverlapMeetingsPopover`

**`meeting-form/`** — `NewMeeting`, `EditMeeting`, `MeetingForm`, `ViewMeeting`,
`FormValidationBanner` (live "Fix N fields" banner), `RecurringMeeting`, `MeetingSchedules`
(the meeting's own schedule plus the second "linked" one it can run in another mode),
`ScheduleSummaryCard`, `ZoomHostField`, `ConflictOverrideModal`, `DeleteMeetingModal`,
`DeleteRecurringModal`, `RemoveLinkedScheduleModal`, `SuspendMeetingModal`, `ResumeMeetingModal`

**`admin/`** — `AdminShell` at the top, plus per-tab subfolders:
- `diagnostics/` — `DiagnosticsTab` + one card per panel (`SystemStatusCard`,
  `MeetingCountsCard`, `ConflictsCard`/`ConflictList`, `SuspendedCard`, `SyncIssuesCard`,
  `DiagnosticsCardError`) — each card fetches its own `/api/admin/diagnostics/*` endpoint
  independently (see [API Reference §Diagnostics](api-reference.md#diagnostics))
- `signage/` — `SignageTab` (builds a filtered `/signage` URL to hand to the display device)
- `users/` — `UsersTab`, `InviteUserModal`, `EditRoleModal`, `RemoveUserModal`
- `export/` — `ExportTab`, `LeaseConfigModal`, `MeetingExportConfigModal`
- `shared/` — `Card`, `CardHeader` (used across every admin tab)

**`docs/`** — `DocsShell`, `DocsArticle`, `DocsTocList`, `DocsIcons` — renders `/docs` from this
repository's own top-level `docs/` folder, snapshotted at build time into
`util/docs/docsContent.generated.ts` (see `util/` below) — there's no separate `frontend/docs/`.

**`auth/`** — the signed-in/signed-out/access-denied state: `AccessDeniedCard`,
`GoogleSignInButton`, `LoginCard`, `MobileLoginSheet`, `ProfileCard`,
`SignInDifferentAccountButton`

**`navigation/`** — real site-chrome only: `AppNavigation`, `MobileAppNavigation`,
`MobileAppSidebar`

**`shared/`** — components genuinely used by 2+ domains, kept deliberately small:
`Toast`/`ToastProvider` (app-wide notification system — see
[Technical Decisions §Toast/Banner Notification System](../02-handoff/technical-decisions.md#toast-banner-notification-system)),
`FilterGroup`. Not a general dumping ground — i.e. if a component only has one caller, it should belong in
that caller's domain.

Each component's `.module.scss` lives alongside it as a sibling file in the same folder (e.g.
`Button.tsx` + `Button.module.scss`) — there are no barrel/index files. `styles/` at the
`frontend/` root holds two global files: `Variables.module.scss` (design tokens, `@import`ed by
nearly every component module) and `MainLayout.module.scss` (the app shell, used by
`app/ClientLayout.tsx`).

### `util/` — domain-logic utilities, grouped by subfolder

- `common/` — `breakpoints.ts`, `color.ts`, `linkify.tsx`, `simpleCache.ts` (generic get-or-fetch
  cache)
- `date/` — `timeUtils.ts`, `timeFormat.tsx`, `weekDates.ts`, `dateTransition.ts` (swipe
  direction/same-week math plus the shared `dateEnterMotion` enter-transition helper, used by both
  mobile and desktop calendar views)
- `filters/` — `meetingFilters.ts` (tag/room predicates for the authenticated Day/Week views),
  `signageFilters.ts` (standalone URL-param parsing for the public `/signage` page — the two
  never share code), `tagOrder.ts`
- `lease/` — `leaseDefaults.ts`, `leaseYearCycles.ts`
- `meetings/` — `conflictDisplay.ts`, `meetingExportFields.ts`, `meetingOccurrences.ts`
  (recurrence expansion), `meetingOverlapLayout.ts` (Week view's visual side-by-side layout —
  rendering, not scheduling), `meetingValidation.ts` (the `zod` schema `write`/`update` validate
  against), `publicMeeting.ts` (the `PublicMeeting` allowlist — see
  [Technical Decisions §Admin-Gated Mids Pattern for Calendar Badges](../02-handoff/technical-decisions.md#admin-gated-mids-pattern-for-calendar-badges)),
  `recurrenceDisplay.ts`, `resourceLocks.ts` (advisory-lock helpers), `resourceOverlap.ts`
  (recurrence-aware room/Zoom-room/Zoom-host conflict detection — scheduling, not rendering; shared
  by host resolution and the Diagnostics Conflicts panel), `suspension.ts`, `suspensionText.ts`
- `rooms/` — `filterColors.ts`, `modeIcons.ts`, `rooms.ts` (physical/Zoom room lists and pairing),
  `zoomHosts.ts`
- `docs/` — `loadDocs.ts`, `parseMarkdown.ts`, `docsContent.generated.ts` (build-time generated,
  gitignored, not hand-edited) — backs the in-app `/docs` page. Snapshotted from this repository's
  own top-level `docs/` folder by `build-scripts/generate-docs-content.mjs` on every `dev`/`build`
  run, since Turbopack can't bundle files outside the project root and `/docs` is dynamically
  rendered
- `roles.ts` — standalone, role-comparison helpers

`meetingOverlapLayout.ts` and `resourceOverlap.ts` both deal with "meetings overlapping," but
answer different questions: the former only computes visual layout for meetings that overlap in
Week view, while the latter answers a logically prior scheduling question — whether two meetings'
occurrences actually conflict on a shared resource.

### `services/` — backend services

`auth.ts` (`getAuth`, `requireRole`), `googleCalendar.ts` (multi-calendar
create/update/delete/EXDATE/UNTIL/reachability), `googleTokenRefresh.ts` (kept separate from
`authConfig.ts` so it has no Prisma dependency and can run on Edge middleware — see
[Technical Decisions §Authentication (NextAuth + Google OAuth 2.0 + OIDC)](../02-handoff/technical-decisions.md#authentication-nextauth-google-oauth-2-0-oidc)),
`syncMeeting.ts` (client-side helpers: `retryMeetingSync`, `pollMeetingSyncStatus` — see the Toast
system decision entry above for why the latter exists), `zoom.ts` (Server-to-Server token fetch,
create/update/delete Zoom meeting, room→calendar lookup map, `resolveZoomHost` pool lookup).

### `hooks/`

`useMeetingForm.ts` (shared state/handlers/validation for `NewMeeting`/`EditMeeting`),
`useConflictMids.ts` / `useSyncErrorMids.ts` (admin-gated calendar-badge data — see the
admin-gated-mids pattern above), `useWeekMeetings.ts` / `useRangeMeetings.ts` (Day/Week meeting
fetch + module-level cache), `useZoomHostPool.ts`, `useUserAvatar.tsx`, `useViewport.ts` /
`useIsPhone.ts` / `useBreakpoint.ts` (responsive layout), `useElementSize.ts` /
`useElementWidth.ts`, `useScrollNavHide.ts`, `usePagefindComponentUI.ts` (docs search).

---

## Data Layer

### `prisma/schema.prisma`

PostgreSQL (Neon) via Prisma. Models:

| Model | Key Fields |
|---|---|
| `Meeting` | `mid` (unique), `title`, `calType String[]`, `description`, `creator`, `group`, `startDateTime`/`endDateTime` (`@db.Timestamptz`), `email`, `zoomRoom`, `zoomLink`, `zid`, `zoomPasscode`, `zoomInvitation`, `room`, `modeType`, `status` (default `"Active"`), `isRecurring`, `googleCalendarEventId`, `googleCalendarEventIds Json?` (per-category), `googleSyncStatus`, `googleSyncError`, `zoomCalendarEventId`, `zoomSyncStatus`, `zoomHost`, `attemptedZoomHost` (the pool host an explicit pick collided with, kept for conflict-badge bucketing), `zoomSyncError`, `deletedAt`, `updatedAt` |
| `RecurrencePattern` | `mid` (unique, FK to Meeting), `type`, `startDate`, `endDate`, `numberOfOccurrences`, `daysOfWeek[]`, `firstDayOfWeek`, `interval`, `weekOfMonth`, `dayOfMonth`, `excludedDates DateTime[]` |
| `SuspensionPeriod` | one row per suspend→resume cycle (never mutated once superseded) — `mid` (FK), `from`, `to?`, `resumeEventIds Json?` (pre-created post-resume GCal event IDs, held until reconciled), `promoted Boolean` |
| `Admin` | `email` (unique), `name`, `role Role` (`SUPER_ADMIN \| ADMIN \| USER`), `googleId` |
| `LeaseSettings` | singleton — `leaseStartDate`, `leaseEndDate`, `rooms Json` (`IRoomRate[]`), `agentFirstName/LastName/Title/Email/Phone/StreetAddress/City/State/Zip`, `emailTemplate` |
| `MeetingExportSettings` | singleton — `fields String[]`, which optional columns the Export Meetings XLSX download includes (Meeting ID/Name are always included regardless) |
| `User` | `name`, `uid` (unique) — unused legacy model |

See [API Reference §Data Types Reference](api-reference.md#data-types-reference) for the matching `types/models.ts`
TypeScript interfaces.

---

## Authentication

**Provider:** NextAuth (`next-auth` 4) with Google, configured in `frontend/app/api/auth/authConfig.ts`. Two protocols share one token exchange: **OpenID Connect** (the `openid email profile` scopes) handles identity — proving who signed in — and **OAuth 2.0** (the `calendar.events` scope) handles authorization — letting the server call Google Calendar on that admin's behalf. OIDC is itself built as an identity layer on top of OAuth 2.0, so in practice this is one combined flow, not two separate ones.

**Flow:**
1. Signing in redirects to Google's OAuth 2.0 consent screen, requesting the `openid email profile` scopes plus `https://www.googleapis.com/auth/calendar.events`.
2. The `signIn` callback looks up the user's email in the `Admin` table and rejects sign-in entirely if no row exists — accounts are invite-only, added via the Users tab (`POST /api/write/admin`), never self-registered.
3. The `jwt` callback stores the Google access/refresh token on the session token and re-reads `role` from the DB on every token refresh (not just at login), so a role change or removal takes effect without waiting for the session to expire.
4. Near-expiry access tokens are refreshed automatically against Google's token endpoint (`frontend/services/googleTokenRefresh.ts`); a revoked refresh token forces re-login. `frontend/proxy.ts` is what actually persists a refreshed token to the session cookie — `getServerSession()`'s single-argument code path (used elsewhere via `getAuth()`) can't write cookies, so without the proxy doing this, a refresh would silently re-run on every request instead of roughly once an hour. See [Technical Decisions](../02-handoff/technical-decisions.md) for why.
5. Route handlers call `requireRole(minRole)` (`frontend/services/auth.ts`) to gate access — see [API Reference](api-reference.md) for which routes require `ADMIN` vs `SUPER_ADMIN`. `frontend/tests/unit/routeGuards.test.ts` enforces that every route either has this guard or is explicitly allowlisted as public, so a new route can't silently ship unguarded.

---

## Environment Variables

See [Environment Variables](environment-variables.md) for the full reference table.

---

## Testing (`frontend/tests/`)

```text
tests/
├── e2e/           # Playwright specs
│   └── support/   # Auth cookie minting, fail-soft sync-state fixtures
├── component/      # Jest + React Testing Library — individual components in isolation
├── unit/          # Jest — pure functions, no I/O (plus routeGuards.test.ts, an AST-based check
│                  #   that every route.ts either guards with requireRole or is allowlisted public,
│                  #   and proxy.test.ts, which imports next/server directly)
├── integration/   # Jest — route handlers against a real (embedded) Postgres DB, services mocked
├── factories/     # Framework-agnostic seed helpers (admin/meeting/lease-settings)
├── mocks/         # Shared jest.mock() fixtures for external services
└── postgres/      # embedded-postgres wrapper (spins up a real postgres binary as a child process)
```

Four tiers (unit/component/integration/e2e), all of which run in CI as their own jobs (plus
`lint`, `doc-freshness`, and CodeQL) — see
[Technical Decisions §Testing Strategy (Playwright-Primary, Jest for Narrower Jobs)](../02-handoff/technical-decisions.md#testing-strategy-playwright-primary-jest-for-narrower-jobs)
for the reasoning behind the split. Full walkthrough of how each tier works, how
auth/external services are handled without real credentials, and what's still manual:
[Testing](testing/README.md).

---

## Scripts

```bash
yarn dev               # Start Next.js dev server
yarn build             # rebuild docs snapshot + search index, prisma generate, migrate deploy (prod only), next build
yarn start             # Start production server
yarn lint              # Run ESLint
yarn lint:css          # Run stylelint (separate from yarn lint — only runs on .scss files)
yarn typecheck         # tsc --noEmit — full cross-file type-checking
yarn test:unit         # Jest — pure functions
yarn test:component    # Jest + React Testing Library — components in isolation
yarn test:integration  # Jest — route handlers against an embedded Postgres instance
yarn test:e2e          # Playwright — full browser E2E (needs `yarn playwright install --with-deps chromium` once)
yarn test:all          # lint && lint:css && typecheck && test:unit && test:component && test:integration && test:e2e
```

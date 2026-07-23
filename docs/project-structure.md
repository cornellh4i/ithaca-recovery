# Project Structure

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, full-stack TypeScript) |
| UI | React 19 + Material-UI 7 |
| Database | MongoDB via Prisma ORM 5 |
| Authentication | NextAuth with Google OAuth 2.0 + OpenID Connect (`next-auth` 4) |
| External APIs | Google Calendar API (`googleapis`), Zoom API (Server-to-Server OAuth, see [api-reference.md](api-reference.md#zoom)) |
| State Management | TanStack React Query, SWR |
| XLSX | `xlsx` (SheetJS) — meeting export |
| Testing | Playwright (E2E), Jest + `@swc/jest` (unit/integration), `mongodb-memory-server` (in-memory Mongo replica set) — see [testing/README.md](testing/README.md) |

---

## Top-Level Layout

```
ithaca-recovery/
├── frontend/          # Next.js application (all source code lives here)
│   ├── app/           # App Router — pages, API routes, components
│   ├── actions/       # Next.js server actions
│   ├── services/      # Backend services (auth, Google Calendar, Zoom)
│   ├── lib/           # Shared server-side singletons/helpers (Prisma client, auth cookie helpers)
│   ├── hooks/         # Shared React hooks (meeting form state)
│   ├── styles/        # SCSS modules
│   ├── prisma/        # Prisma schema
│   ├── public/        # Static assets (svg/, favicon)
│   ├── config/        # jest/playwright/eslint configs (next.config.mjs and tsconfig.json stay
│   │                  #   at the frontend/ root — both tools require that)
│   ├── test/          # Playwright + Jest suite — see Testing section below
│   └── util/          # Shared types, formatting, and domain-logic utilities (incl. lease defaults)
├── .github/workflows/ # CI (test.yml — unit/integration/e2e jobs)
└── docs/              # Documentation
```

---

## Frontend (`frontend/`)

### `app/` — App Router

```
app/
├── (main)/                      # Route group: the live, authenticated app
│   ├── layout.tsx
│   ├── page.tsx                 # Home — calendar (Day/Week)
│   └── admin/page.tsx           # /admin — AdminShell
├── (signage)/                   # No auth check — renders fully logged out
│   └── signage/
│       ├── layout.tsx           
│       └── page.tsx             # /signage — read-only calendar for signage
├── api/                         # All API route handlers (see api-reference.md)
│   ├── write/meeting/, update/meeting/, update/meeting/sync/, delete/meeting/
│   ├── retrieve/meeting/        # root, [id]/, day/, week/, month/
│   ├── write/admin/, retrieve/admin/, retrieve/admins/, update/admin/, delete/admin/
│   ├── admin/diagnostics/
│   ├── export/lease/, export/meetings/
│   ├── retrieve/lease-settings/, update/lease-settings/
│   └── auth/authConfig.ts, auth/status/, auth/[...nextauth]/
├── components/
│   ├── atoms/                   # Primitive UI elements
│   ├── molecules/               # Composite components
│   └── organisms/               # Feature-level components
├── ClientLayout.tsx             # Client-side layout wrapper
└── ProviderWrapper.tsx          # React context providers
```

### Pages

| Route | Purpose |
|---|---|
| `/` | Home — calendar (Day/Week) |
| `/admin` | Admin shell: Diagnostics, Users, Import, Export tabs |
| `/signage` | Read-only kiosk calendar for the physical display board |

### Component Hierarchy (Atomic Design)

**Atoms** — `app/components/atoms/`: `CheckBox`, `CheckButton`, `DatePicker`, `TimePicker`, `Dropdown`, `Logo`, `MiniCalendar`, `ModeTypeButtons`, `RadioGroup`, `SpinnerInput`, `StatCounter`, `StatusPill`, `TextButton`, `TextField`, `BoxText`

**Molecules** — `app/components/molecules/`: `CardHeader`, `DailyViewRow`, `DeleteRecurringModal`, `FilterGroup`, `MeetingsFilter`, `OverlapMeetingsModal`, `RecurringMeeting`, `WeeklyViewColumn`

**Organisms** — `app/components/organisms/`: `AdminShell`, `AppNavbar`, `CalendarNavbar`, `CalendarSidebar`, `DailyView`, `WeeklyView`, `DiagnosticsTab`, `UsersTab`, `ImportTab`, `ExportTab`, `SignInPrompt`, `MeetingForm`, `NewMeeting`, `EditMeeting`, `ViewMeeting`

There's no `templates/` and `pages/` tier — page-level composition is inlined directly into `(main)/page.tsx`, `(signage)/page.tsx`, and `(main)/admin/page.tsx`.

### `util/` — shared logic

`cacheUtils.ts`, `color.ts`, `filterColors.ts` (room/category color constants), `leaseDefaults.ts` (default `LeaseSettings` used until a Super Admin saves real ones), `meetingFilters.ts` (tag/room filter predicates shared by Day and Week views), `meetingOccurrences.ts` (recurrence expansion, shared by the day/week retrieve routes), `meetingOverlapLayout.ts` (sweep-line overlap layout for Week view), `models.ts` (shared TS interfaces), `recurrenceDisplay.ts`, `rooms.ts` (physical/Zoom room lists and pairing), `signageFilters.ts` (URL-param parsing for `/signage`), `simpleCache.ts` (generic get-or-fetch cache), `timeFormat.ts`, `timeUtils.ts`.

### `services/` — backend services

`auth.ts` (`getAuth`, `requireRole`), `googleCalendar.ts` (multi-calendar create/update/delete/EXDATE/UNTIL/reachability), `zoom.ts` (Server-to-Server token fetch, per-room create/update/delete Zoom meeting, room→calendar and room→host-email lookup maps).

### `hooks/`

`useMeetingForm.ts` — shared state, handlers, validation, and payload-building logic for `NewMeeting.tsx`/`EditMeeting.tsx`.

---

## Data Layer

### `prisma/schema.prisma`

MongoDB via Prisma. Models:

| Model | Key Fields |
|---|---|
| `Meeting` | `mid` (unique), `title`, `calType String[]`, `description`, `creator`, `group`, `startDateTime`, `endDateTime`, `email`, `zoomRoom`, `zoomLink`, `zid`, `zoomCalendarEventId`, `zoomSyncStatus`, `room`, `modeType`, `status` (default `"Active"`), `isRecurring`, `googleCalendarEventId`, `googleCalendarEventIds Json?` (per-category), `syncStatus`, `deletedAt`, `updatedAt` |
| `RecurrencePattern` | `mid` (unique, FK to Meeting), `type`, `startDate`, `endDate`, `numberOfOccurrences`, `daysOfWeek[]`, `firstDayOfWeek`, `interval`, `weekOfMonth`, `dayOfMonth`, `excludedDates DateTime[]` |
| `Admin` | `email` (unique), `name`, `role Role` (`SUPER_ADMIN \| ADMIN \| USER`), `googleId`, `refreshToken`, `accessToken`, `tokenExpiresAt` |
| `LeaseSettings` | singleton — `leaseStartDate`, `leaseEndDate`, `rooms Json` (`IRoomRate[]`), `agentFirstName/LastName/Title/Email/Phone/StreetAddress/City/State/Zip`, `emailTemplate` |
| `User` | `name`, `uid` (unique) — unused legacy model |

See [api-reference.md](api-reference.md#data-types-reference) for the matching `util/models.ts` TypeScript interfaces.

---

## Authentication

**Provider:** NextAuth (`next-auth` 4) with Google, configured in `frontend/app/api/auth/authConfig.ts`. Two protocols share one token exchange: **OpenID Connect** (the `openid email profile` scopes) handles identity — proving who signed in — and **OAuth 2.0** (the `calendar.events` scope) handles authorization — letting the server call Google Calendar on that admin's behalf. OIDC is itself built as an identity layer on top of OAuth 2.0, so in practice this is one combined flow, not two separate ones.

**Flow:**
1. Signing in redirects to Google's OAuth 2.0 consent screen, requesting the `openid email profile` scopes plus `https://www.googleapis.com/auth/calendar.events`.
2. The `signIn` callback looks up the user's email in the `Admin` table and rejects sign-in entirely if no row exists — accounts are invite-only, added via the Users tab (`POST /api/write/admin`), never self-registered.
3. The `jwt` callback stores the Google access/refresh token on the session token, persists them onto the `Admin` row, and re-reads `role` from the DB on every token refresh (not just at login), so a role change or removal takes effect without waiting for the session to expire.
4. Near-expiry access tokens are refreshed automatically against Google's token endpoint (`frontend/services/googleTokenRefresh.ts`); a revoked refresh token forces re-login. `frontend/proxy.ts` is what actually persists a refreshed token to the session cookie — `getServerSession()`'s single-argument code path (used elsewhere via `getAuth()`) can't write cookies, so without the proxy doing this, a refresh would silently re-run on every request instead of roughly once an hour. See [technical-decisions.md](handoff/technical-decisions.md) for why.
5. Route handlers call `requireRole(minRole)` (`frontend/services/auth.ts`) to gate access — see [api-reference.md](api-reference.md) for which routes require `ADMIN` vs `SUPER_ADMIN`. `frontend/test/unit/routeGuards.test.ts` enforces that every route either has this guard or is explicitly allowlisted as public, so a new route can't silently ship unguarded.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MongoDB connection string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret |
| `NEXTAUTH_URL` | Canonical app URL NextAuth uses to build redirect/callback URLs |
| `GOOGLE_CALENDAR_AA` / `GOOGLE_CALENDAR_ALANON` / `GOOGLE_CALENDAR_OTHER` | Google Calendar IDs to publish each category's events to |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth credentials (account-level) |
| `NEXT_PUBLIC_ZOOM_BASE_API` | Zoom API base URL (`https://api.zoom.us/v2`) |
| `GOOGLE_CALENDAR_ZOOM_<ROOM>` (×5) | Google Calendar ID for each Zoom-enabled room's own calendar |
| `ZOOM_HOST_<ROOM>` (×5) | Licensed Zoom user email that hosts meetings for that room |

No Redis instance is required to run the app — the unused `redis` package and its entirely-commented-out `app/api/server/redis.ts` were removed as dead code.

---

## Testing (`frontend/test/`)

```
test/
├── e2e/           # Playwright specs, 1:1 with docs/testing/manual-test-script-template.md's sections
│   └── support/   # Auth cookie minting, fail-soft sync-state fixtures
├── unit/          # Jest — pure functions, no I/O (plus routeGuards.test.ts, an AST-based check
│                  #   that every route.ts either guards with requireRole or is allowlisted public,
│                  #   and proxy.test.ts, which imports next/server directly)
├── integration/   # Jest — route handlers against a real (in-memory) DB, services mocked
├── factories/     # Framework-agnostic seed helpers (admin/meeting/lease-settings)
└── mongo/         # mongodb-memory-server replica-set wrapper
```

Three tiers (unit/integration/e2e), run in CI via `.github/workflows/test.yml` on every push/PR to `main`/`master`. Full walkthrough of how each tier works, how auth/external services are handled without real credentials, and what's still manual: [`docs/testing/README.md`](testing/README.md).

---

## Scripts

```bash
yarn dev               # Start Next.js dev server
yarn build             # prisma generate && next build
yarn start             # Start production server
yarn lint              # Run ESLint
yarn test:unit         # Jest — pure functions
yarn test:integration  # Jest — route handlers against an in-memory Mongo replica set
yarn test:e2e          # Playwright — full browser E2E (needs `npx playwright install --with-deps chromium` once)
```

# Project Structure

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, full-stack TypeScript) |
| UI | React 18 + Material-UI 5 |
| Database | MongoDB via Prisma ORM 5 |
| Authentication | NextAuth with Google OAuth 2.0 + OpenID Connect (`next-auth` 4) |
| External APIs | Google Calendar API (`googleapis`), Zoom API (Server-to-Server OAuth, see [api-reference.md](api-reference.md#zoom)) |
| State Management | TanStack React Query, SWR |
| XLSX | `xlsx` (SheetJS) — meeting export |

---

## Top-Level Layout

```
ithaca-recovery/
├── frontend/          # Next.js application (all source code lives here)
│   ├── app/           # App Router — pages, API routes, components
│   ├── actions/       # Next.js server actions
│   ├── services/      # Backend services (auth, Google Calendar, lease defaults)
│   ├── hooks/         # Shared React hooks (meeting form state)
│   ├── styles/        # SCSS modules
│   ├── prisma/        # Prisma schema
│   ├── public/        # Static assets (svg/, favicon)
│   └── util/          # Shared types, formatting, and domain-logic utilities
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
│   ├── auth/authConfig.ts, auth/status/, auth/[...nextauth]/
│   └── server/redis.ts          # dead code (entirely commented out)
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

`cacheUtils.ts`, `color.ts`, `filterColors.ts` (room/category color constants), `meetingFilters.ts` (tag/room filter predicates shared by Day and Week views), `meetingOccurrences.ts` (recurrence expansion, shared by the day/week retrieve routes), `meetingOverlapLayout.ts` (sweep-line overlap layout for Week view), `models.ts` (shared TS interfaces), `recurrenceDisplay.ts`, `rooms.ts` (physical/Zoom room lists and pairing), `signageFilters.ts` (URL-param parsing for `/signage`), `simpleCache.ts` (generic get-or-fetch cache), `timeFormat.ts`, `timeUtils.ts`.

### `services/` — backend services

`auth.ts` (`getAuth`, `requireRole`), `googleCalendar.ts` (multi-calendar create/update/delete/EXDATE/UNTIL/reachability), `zoom.ts` (Server-to-Server token fetch, per-room create/update/delete Zoom meeting, room→calendar and room→host-email lookup maps), `leaseDefaults.ts` (default `LeaseSettings` used until a Super Admin saves real ones).

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
4. Near-expiry access tokens are refreshed automatically against Google's token endpoint; a revoked refresh token forces re-login.
5. Route handlers call `requireRole(minRole)` (`frontend/services/auth.ts`) to gate access — see [api-reference.md](api-reference.md) for which routes require `ADMIN` vs `SUPER_ADMIN`.

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

The `redis` package is still listed in `package.json` but nothing in the app imports it — `app/api/server/redis.ts` is entirely commented out — so no Redis instance is required to run the app today.

---

## Scripts

```bash
yarn dev          # Start Next.js dev server
yarn build        # prisma generate && next build
yarn start        # Start production server
yarn lint         # Run ESLint
```

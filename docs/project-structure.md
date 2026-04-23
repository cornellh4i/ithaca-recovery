# Project Structure 

<!-- [TODO: Change when complete transition to Google] -->

## Tech Stack 

| Layer | Technology |
|---|---|
| Framework | Next.js 14.1.1 (App Router, full-stack TypeScript) |
| UI | React 18.2.0 + Material-UI 5.16.7 |
| Database | MongoDB via Prisma ORM 5.16.1 |
| Caching / Session | Redis |
| Authentication | Azure AD via MSAL (Microsoft Authentication Library) | <!-- [TODO] -->
| External APIs | Zoom API, Microsoft Graph API  | <!-- [TODO] -->
| State Management | TanStack React Query |

---

## Top-Level Layout

```
ithaca-recovery/
├── frontend/          # Next.js application (all source code lives here)
│   ├── app/           # App Router — pages, API routes, components
│   ├── actions/       # Next.js server actions
│   ├── services/      # Backend services (auth, redis, session)
│   ├── styles/        # SCSS modules
│   ├── prisma/        # Prisma schema and migrations
│   ├── public/        # Static assets
│   └── util/          # Shared types and utilities
├── docs/              # Documentation
└── dump.rdb           # Redis persistence file
```

---

## Frontend (`frontend/`)

### `app/` — App Router

```
app/
├── api/                        # All API route handlers (see api-reference.md)
│   ├── write/meeting/          # POST — create meeting
│   ├── retrieve/meeting/       # GET — fetch meeting(s)
│   │   ├── [id]/               # By ID
│   │   ├── day/                # By day
│   │   ├── week/               # By week
│   │   └── month/              # By month
│   ├── update/meeting/         # PUT — update meeting
│   ├── delete/meeting/         # DELETE — delete meeting
│   ├── write/admin/            # POST — create admin
│   ├── retrieve/admin/         # GET — get admin by email
│   ├── delete/admin/           # DELETE — delete admin
│   ├── zoom/                   # Zoom API proxy routes
│   ├── microsoft/              # Microsoft Graph API proxy routes
│   ├── auth/status/            # GET — auth status check
│   └── server/                 # Server utilities (account, url, session)
├── auth/
│   ├── authConfig.ts           # Azure MSAL client configuration
│   ├── AuthProvider.ts         # Auth wrapper (token acquisition, callbacks)
│   ├── SessionPartitionManager.ts
│   └── redis/
│       └── redisCacheClient.ts # Distributed token cache backed by Redis
├── components/
│   ├── atoms/                  # Primitive UI elements
│   ├── molecules/              # Composite components
│   ├── organisms/              # Complex, feature-level components
│   ├── templates/              # Full-page layout templates
│   └── navigation/             # Nav bar and routing components
├── contacts/                   # /contacts page
├── createmeeting/              # /createmeeting page
├── meetings/                   # /meetings page
├── test/                       # Internal test pages
├── ClientLayout.tsx            # Client-side layout wrapper
├── ProviderWrapper.tsx         # React context providers
├── layout.tsx                  # Root layout (auth guard lives here)
└── page.tsx                    # Home page — renders HomePageLayout
```

### Pages <!-- [TODO: Double check these pages. Some of them are not used iirc?] -->

| Route | Purpose |
|---|---|
| `/` | Home — calendar / daily meeting view |
| `/createmeeting` | Create a new meeting (with Zoom integration) |
| `/meetings` | List all meetings |
| `/contacts` | Contacts page |
| `/auth/callback` | Azure OAuth redirect handler |

### Component Hierarchy (Atomic Design)

**Atoms** — stateless, single-purpose UI elements
- DatePicker, TimePicker, TextField, ModeTypeButtons, RadioGroup, Checkbox, etc.

**Molecules** — combinations of atoms
- DailyViewRow, MeetingsFilter, RecurringMeeting, DeleteRecurringModal, WeeklyViewColumn, PandaDocButton

**Organisms** — feature-level components
- MeetingForm, NewMeeting, EditMeeting, ViewMeeting, DailyView, CalendarSidebar

**Templates** — full-page layout wrappers
- HomePageLayout

---

## Data Layer

### `prisma/`

Prisma schema targets MongoDB. Models:

| Model | Key Fields |
|---|---|
| `Meeting` | `mid` (unique), `title`, `calType`, `description`, `creator`, `group`, `startDateTime`, `endDateTime`, `email`, `zoomAccount`, `zoomLink`, `zid`, `room`, `modeType`, `isRecurring` |
| `RecurrencePattern` | `mid` (unique, FK to Meeting), `type`, `startDate`, `endDate`, `numberOfOccurences`, `daysOfWeek[]`, `firstDayOfWeek`, `interval` |
| `Admin` | `email` (unique), `name`, `uid` (unique), `privilegeMode` |
| `User` | `name`, `uid` (unique) |

### `util/models.ts` — TypeScript Interfaces

```typescript
interface IMeeting {
  title: string;
  mid: string;
  description: string;
  creator: string;          // admin email
  group: string;
  startDateTime: Date;
  endDateTime: Date;
  email: string;
  zoomAccount?: string | null;
  zoomLink?: string | null;
  zid?: string | null;      // Zoom meeting ID
  calType: string;
  modeType: string;         // "Remote" | "In Person" | "Hybrid"
  room: string;
  isRecurring?: boolean;
  recurrencePattern?: IRecurrencePattern | null;
}

interface IRecurrencePattern {
  mid?: string;
  type: string;             // "weekly" | "daily"
  startDate: Date;
  endDate?: Date | null;
  numberOfOccurrences?: number | null;
  daysOfWeek?: string[] | null;   // e.g. ["Monday", "Wednesday"]
  firstDayOfWeek: string;
  interval: number;         // 1 = weekly, 2 = biweekly
}

interface IAdmin extends IUser {
  email: string;
  privilegeMode?: string;
}

interface IUser {
  uid: string;
  name: string;
}
```

---

## Authentication <!-- [TODO] -->

**Provider:** Azure Active Directory via MSAL `ConfidentialClientApplication`

**Flow:**
1. Root layout calls `authProvider.authenticate()` on every request.
2. If no valid session, user is redirected to `getAuthCodeUrl()` (Azure login page).
3. Azure redirects to `/auth/callback` with an authorization code.
4. `AuthProvider.handleAuthCodeCallback()` exchanges the code for tokens.
5. Tokens are stored in Redis via `RedisCacheClient`.
6. Session (partition key) is stored in an httpOnly cookie (`__session`, `sameSite=lax`).

**Scopes requested:**
- `https://graph.microsoft.com/v1.0/Group.Read.All`
- `https://graph.microsoft.com/v1.0/Calendars.Read`
- `User.Read`

**Redirect URIs:**
- Development: `http://localhost:3000/auth/callback`
- Production: `https://ithaca-recovery-deployment.vercel.app/auth/callback`

---

## Environment Variables <!-- [TODO] -->

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MongoDB connection string |
| `AZURE_TENANT_ID` | Azure AD tenant |
| `AZURE_CLIENT_ID` | Azure app registration client ID |
| `AZURE_CLIENT_SECRET` | Azure app client secret |
| `ZOOM1_CLIENT_ID` / `ZOOM1_CLIENT_SECRET` / `ZOOM1_ACCOUNT_ID` | Zoom OAuth credentials |
| `REDIS_URL` | Redis connection string |
| `SESSION_SECRET` | Cookie session signing secret |

---

## Scripts

```bash
yarn dev          # Start Next.js dev server
yarn build        # prisma generate && next build
yarn start        # Start production server
yarn lint         # Run ESLint
```

# Integration Guides

Step-by-step setup instructions for every external service the platform depends on. For the *why* behind each choice, see [technical-decisions.md](technical-decisions.md).

---

## Table of Contents

1. [Environment Variables Reference](#1-environment-variables-reference)
2. [MongoDB + Prisma](#2-mongodb--prisma)
3. [Azure AD / Microsoft MSAL](#3-azure-ad--microsoft-msal)
4. [Redis](#4-redis)
5. [Zoom API](#5-zoom-api)
6. [Microsoft Graph API](#6-microsoft-graph-api)
7. [PandaDocs / CSV Lease Export](#7-pandadocs--csv-lease-export)
8. [Vercel Deployment](#8-vercel-deployment)
9. [Planned: Google Auth + Google Calendar Migration](#9-planned-google-auth--google-calendar-migration)

---

## 1. Environment Variables Reference

Create a `.env` file in `frontend/` (never commit it). All variables used by the app:

```env
# MongoDB
DATABASE_URL="mongodb+srv://..."

# Azure AD (MSAL)
CLIENT_ID="<azure-app-client-id>"
CLIENT_SECRET="<azure-app-client-secret>"
TENANT_ID="<azure-tenant-id>"
CLOUD_INSTANCE="https://login.microsoftonline.com/"

# Auth callback URLs
NEXT_PUBLIC_AUTH_CALLBACK_URI="http://localhost:3000/auth/callback"
NEXT_PUBLIC_AUTH_CALLBACK_PROD_URI="https://ithaca-recovery-deployment.vercel.app/auth/callback"

# Session
SESSION_SECRET="<random-secret-string>"

# Redis
NEXT_PUBLIC_REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_REDIS_PROD_URL="rediss://..."

# Microsoft Graph API
NEXT_PUBLIC_GRAPH_API_ENDPOINT="https://graph.microsoft.com/"

# Zoom (one set per account)
ZOOM1_CLIENT_ID="..."
ZOOM1_CLIENT_SECRET="..."
ZOOM1_ACCOUNT_ID="..."
NEXT_PUBLIC_ZOOM_BASE_API="https://api.zoom.us/v2"
NEXT_PUBLIC_ZOOM1_EMAIL="zoom-account-1@example.com"
```

---

## 2. MongoDB + Prisma

### Prerequisites
- A MongoDB Atlas cluster (or local MongoDB instance).
- Node.js 18+.

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
`frontend/prisma/schema.prisma` — defines `Meeting`, `RecurrencePattern`, `Admin`, and `User` models.

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

## 3. Azure AD / Microsoft MSAL

### What it does
Azure AD authenticates board members via Microsoft SSO. The same token is used to call Microsoft Graph API (groups, calendars).

> **Note:** This integration is being replaced by Google Auth. See [section 9](#9-planned-google-auth--google-calendar-migration).

### Azure App Registration setup

1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**.
2. Set the redirect URI to:
   - Development: `http://localhost:3000/auth/callback`
   - Production: `https://ithaca-recovery-deployment.vercel.app/auth/callback`
   - Platform type: **Web**
3. Under **Certificates & secrets**, create a new client secret. Copy the value immediately (it won't be shown again).
4. Under **API permissions**, add:
   - `Microsoft Graph` → `Delegated` → `User.Read`
   - `Microsoft Graph` → `Delegated` → `Group.Read.All`
   - `Microsoft Graph` → `Delegated` → `Calendars.Read`
   - Grant admin consent for these permissions.
5. Copy **Application (client) ID** → `CLIENT_ID`
6. Copy **Directory (tenant) ID** → `TENANT_ID`
7. Use the client secret from step 3 → `CLIENT_SECRET`

### How the auth flow works in code

| File | Role |
|---|---|
| [frontend/app/auth/authConfig.ts](../../frontend/app/auth/authConfig.ts) | MSAL configuration (client ID, authority, secret) |
| [frontend/app/auth/AuthProvider.ts](../../frontend/app/auth/AuthProvider.ts) | Wrapper around `ConfidentialClientApplication` — handles login redirect, token acquisition, and account lookup |
| [frontend/app/auth/SessionPartitionManager.ts](../../frontend/app/auth/SessionPartitionManager.ts) | Maps the session cookie to a Redis cache partition key |
| [frontend/app/auth/redis/redisCacheClient.ts](../../frontend/app/auth/redis/redisCacheClient.ts) | Implements MSAL's `ICacheClient` interface backed by Redis |
| [frontend/services/auth.ts](../../frontend/services/auth.ts) | Instantiates `AuthProvider` with Redis cache + session partition factory |
| [frontend/app/auth/callback/route.ts](../../frontend/app/auth/callback/route.ts) | Handles the POST redirect from Azure, exchanges the auth code for tokens |
| [frontend/app/layout.tsx](../../frontend/app/layout.tsx) | Calls `authProvider.authenticate()` on every request; redirects to Azure if not signed in |

### Acquiring an access token in a route handler

```typescript
import getAccessToken from '@/app/api/microsoft/AccessToken';

const token = await getAccessToken(); // returns string | null
```

`getAccessToken` calls `authProvider.authenticate()` → `authProvider.getAccessToken()`, which runs a silent token acquisition against the Redis-backed MSAL cache.

---

## 4. Redis

### What it does
- Stores MSAL token cache entries (one partition per logged-in user).
- Stores OIDC and cloud discovery metadata to avoid repeated cold-start round-trips to Azure.

### Local setup

1. Install Redis:
   ```bash
   brew install redis      # macOS
   sudo apt install redis  # Ubuntu
   ```
2. Start Redis:
   ```bash
   redis-server
   ```
3. Set in `.env`:
   ```env
   NEXT_PUBLIC_REDIS_URL="redis://localhost:6379"
   ```

### Production
- Use a hosted Redis provider (e.g., Redis Cloud, Upstash, or Azure Cache for Redis).
- Set `NEXT_PUBLIC_REDIS_PROD_URL` to the TLS-enabled connection string (`rediss://`).
- The app selects the URL based on `NODE_ENV`:
  - `production` → `NEXT_PUBLIC_REDIS_PROD_URL`
  - anything else → `NEXT_PUBLIC_REDIS_URL`

### Key client code
[frontend/services/redis.ts](../../frontend/services/redis.ts) — creates the `redisClient` singleton using the `redis` npm package. The client auto-connects on first use via `ensureConnected()` in `RedisCacheClient`.

---

## 5. Zoom API

### What it does
When a meeting is created or updated in the platform with a Zoom account selected, the platform creates or updates a corresponding Zoom meeting and stores the join link and Zoom meeting ID in MongoDB.

### Zoom App setup (per account)

1. Go to [marketplace.zoom.us](https://marketplace.zoom.us) → **Develop** → **Build App** → **Server-to-Server OAuth**.
2. Fill in app name and description.
3. Under **Scopes**, add:
   - `meeting:write:admin`
   - `meeting:read:admin`
   - `meeting:delete:admin`
4. Activate the app.
5. Copy **Account ID**, **Client ID**, **Client Secret** → set as `ZOOM1_ACCOUNT_ID`, `ZOOM1_CLIENT_ID`, `ZOOM1_CLIENT_SECRET`.

### Token generation
Every Zoom API call first calls `generateZoomToken()` in [frontend/app/api/zoom/generateToken.ts](../../frontend/app/api/zoom/generateToken.ts), which posts to `https://zoom.us/oauth/token` with `grant_type=account_credentials`. The returned token is short-lived and is not cached.

### Adding a second Zoom account (multi-account rotation — not yet implemented)

The intent is to support multiple Zoom accounts to allow concurrent meetings (Zoom blocks a single account from running two meetings simultaneously).

To add a second account:
1. Create a second Server-to-Server OAuth app in Zoom Marketplace.
2. Add to `.env`:
   ```env
   ZOOM2_CLIENT_ID="..."
   ZOOM2_CLIENT_SECRET="..."
   ZOOM2_ACCOUNT_ID="..."
   NEXT_PUBLIC_ZOOM2_EMAIL="zoom-account-2@example.com"
   ```
3. Implement rotation logic: before creating a Zoom meeting, query the DB for existing meetings that overlap the requested time slot, determine which Zoom accounts are already in use, and select a free one.

### Zoom API base URL
Set via `NEXT_PUBLIC_ZOOM_BASE_API="https://api.zoom.us/v2"`.

### Route files
| Route | File |
|---|---|
| Generate token | [frontend/app/api/zoom/generateToken.ts](../../frontend/app/api/zoom/generateToken.ts) |
| Create meeting | [frontend/app/api/zoom/CreateMeeting/route.ts](../../frontend/app/api/zoom/CreateMeeting/route.ts) |
| Update meeting | [frontend/app/api/zoom/UpdateMeeting/route.ts](../../frontend/app/api/zoom/UpdateMeeting/route.ts) |
| Delete meeting | [frontend/app/api/zoom/DeleteMeeting/route.ts](../../frontend/app/api/zoom/DeleteMeeting/route.ts) |
| Get meeting | [frontend/app/api/zoom/GetMeeting/asyncFunction.ts](../../frontend/app/api/zoom/GetMeeting/asyncFunction.ts) |

---

## 6. Microsoft Graph API

### What it does
Fetches the list of Azure AD groups (representing recovery groups) and their associated calendars. Intended to enable bidirectional calendar sync between the platform's MongoDB records and each group's Microsoft calendar.

> **Note:** This integration is being replaced by Google Calendar API. See [section 9](#9-planned-google-auth--google-calendar-migration).

### Required permissions
Granted via the Azure App Registration (see section 3):
- `Group.Read.All` (delegated)
- `Calendars.Read` (delegated)

### How to call Graph API from a route handler

```typescript
import getAccessToken from '@/app/api/microsoft/AccessToken';

const token = await getAccessToken();
const response = await fetch(`https://graph.microsoft.com/v1.0/groups`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### Current implemented endpoints

| What | Graph endpoint |
|---|---|
| List all groups | `GET /groups` |
| Get a group's calendar | `GET /groups/{groupId}/calendar` |

### Remaining work (unimplemented)
- Read events from a group calendar: `GET /groups/{groupId}/calendar/events`
- Create/update events from the platform: `POST /groups/{groupId}/calendar/events`
- Delete events: `DELETE /groups/{groupId}/calendar/events/{eventId}`
- Bidirectional sync logic (keeping MongoDB and the calendar in agreement)

---

## 7. PandaDocs / CSV Lease Export

### What it does
The "Export CSV" button in the navbar generates a CSV file formatted for PandaDocs' bulk send feature. ICR uploads this CSV to PandaDocs to send annual lease documents to all groups at once.

### How it works
1. Fetches all meetings scheduled in the first week of July (the start of ICR's lease year: July 1 – June 30 of the following year).
2. Maps each meeting to a row with fields PandaDocs expects: client info, room, rate, billable hours, lease dates, and a pre-written email body.
3. Downloads the CSV to the user's browser.

### Room rates
Hardcoded in [frontend/app/components/molecules/PandaDocButton.tsx](../../frontend/app/components/molecules/PandaDocButton.tsx):

| Room | Rate |
|---|---|
| Serenity Room | $15/hr |
| Seeds of Hope | $10/hr |
| Unity Room | $10/hr |
| Room for Improvement | $10/hr |
| Small but Powerful – Left | $10/hr |
| Small but Powerful – Right | $10/hr |
| Zoom Only | $10/month (flat) |

If ICR changes rates, update the `roomRates` object in that file.

### Uploading to PandaDocs
1. Export the CSV from the platform.
2. In PandaDocs, go to **Bulk Send** → upload the CSV → select the lease template → send.

### Future work
A direct PandaDocs API integration would remove the manual upload step. The PandaDocs API supports programmatic document creation and sending. This is listed as a Priority 2 item.

---

## 8. Vercel Deployment

### Initial setup

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the GitHub repo.
3. Set the **Root Directory** to `frontend/`.
4. Set the **Build Command** to `npx prisma generate && next build`.
5. Add all environment variables from section 1 under **Project Settings → Environment Variables**.
6. Deploy.

### Subsequent deploys
Every push to `master` triggers an automatic production deployment. Every pull request gets a preview deployment URL.

### Build command
The build runs `prisma generate` before `next build` to ensure the Prisma client is generated from the current schema. This is set in `frontend/package.json`:
```json
"build": "prisma generate && next build"
```

### Environment variable notes for Vercel
- Set both `NEXT_PUBLIC_REDIS_URL` (used in dev only, but Vercel still needs it defined) and `NEXT_PUBLIC_REDIS_PROD_URL`.
- `NODE_ENV` is automatically set to `production` by Vercel — the app uses this to select the production Redis URL and auth callback URI.

---

## 9. Planned: Google Auth + Google Calendar Migration

The team is actively transitioning from Microsoft Azure AD / MSAL to Google OAuth and from Microsoft Graph Calendar to Google Calendar API. The `[TODO: Update when complete transition to Google]` notes in the documentation track this.

### What changes

| Current | Replacement |
|---|---|
| Azure AD App Registration | Google Cloud project + OAuth 2.0 client |
| `@azure/msal-node` | `google-auth-library` or NextAuth.js |
| `frontend/app/auth/` (entire folder) | Google OAuth callback handler |
| Redis (MSAL token cache) | May still be needed depending on chosen auth library |
| Microsoft Graph API (groups, calendars) | Google Calendar API |
| `CLOUD_INSTANCE`, `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

### Recommended approach for the incoming team

1. **Auth:** Use [NextAuth.js](https://next-auth.js.org/) with the Google provider. It handles token storage, session management, and refresh automatically, replacing the custom `AuthProvider` + Redis + `SessionPartitionManager` stack.
2. **Calendar:** Use the [Google Calendar API](https://developers.google.com/calendar/api) with the access token from NextAuth. The relevant endpoints are `calendar.events.list`, `calendar.events.insert`, `calendar.events.patch`, `calendar.events.delete` on each group's shared calendar.
3. **Migration path:** Run both auth systems in parallel behind a feature flag until Google auth is verified working in production, then remove the MSAL code.

### Google Cloud setup (when starting the migration)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project.
2. Enable **Google Calendar API** and **Google People API**.
3. Under **Credentials** → **Create credentials** → **OAuth 2.0 Client ID** → Web application.
4. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (NextAuth dev)
   - `https://ithaca-recovery-deployment.vercel.app/api/auth/callback/google` (prod)
5. Copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client Secret** → `GOOGLE_CLIENT_SECRET`.

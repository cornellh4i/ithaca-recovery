# Technical Decisions

This document answers "why did we build it this way?" for every significant technical choice in the ICR admin platform. Read this before proposing changes to the stack or architecture.

---

## Framework: Next.js App Router (full-stack)

**Decision:** Use Next.js 14 with the App Router as both the frontend framework and the API layer, rather than a separate frontend + Express backend.

**Why:**
- The previous tech lead established this pattern. Migrating to a separate Express backend is listed as a non-priority option in the PRD if routing performance becomes an issue.
- Next.js Route Handlers run server-side and support direct Prisma and Redis calls without an extra network hop.
- Vercel (our host) is built for Next.js — zero-config CI/CD, automatic preview deployments, and serverless function scaling.

**Trade-offs:**
- All API routes are serverless functions. This means each request may spin up a cold instance, which adds latency on the first hit. It also means you cannot hold persistent in-memory state between requests (hence Redis for the token cache).
- The `frontend/` directory contains both UI and backend code, which is non-standard and can be confusing.

---

## Database: MongoDB + Prisma

**Decision:** MongoDB as the database, accessed through Prisma ORM.

**Why MongoDB:**
- Meeting data is loosely structured (optional Zoom fields, optional recurrence, varying room types). A document store handles optional/nullable fields naturally without schema migrations every time a field is added.
- ICR is a small-scale app — we don't have relational query complexity that would require PostgreSQL.

**Why Prisma over Mongoose:**
- Prisma generates TypeScript types from the schema, giving end-to-end type safety from the database model to the API response.
- Mongoose was also installed as a dependency but is not used — Prisma was chosen and Mongoose was never removed.

**Trade-offs:**
- Prisma's MongoDB support is more limited than its PostgreSQL support (no raw query support, no full-text search). For this use case (simple CRUD on meetings and admins) that limitation doesn't matter.
- The `RecurrencePattern` model uses a 1-to-1 relation with `Meeting` via a shared `mid` field. Prisma handles this cleanly, but direct MongoDB queries (bypassing Prisma) need to be aware of this join.

---

## Authentication: Microsoft MSAL (Azure AD) <!-- [TODO: Update this once finish transitioning to Google] -->

**Decision:** Use Azure Active Directory with `@azure/msal-node` (`ConfidentialClientApplication`) for server-side authentication, rather than a simpler username/password or third-party auth service.

**Why:**
- ICR's board members already have Microsoft accounts through their organizational setup, so Azure AD is the natural identity provider — no new accounts to manage.
- Microsoft Graph API (groups, calendars) requires an Azure AD token anyway. Using MSAL for auth means the same token flow covers both login and Graph API access.

**How the token cache works:**
- MSAL's `DistributedCachePlugin` stores serialized token cache entries in Redis, keyed by a partition key derived from the user's session cookie. This is necessary because Next.js serverless functions are stateless — MSAL's default in-memory cache would be lost between requests.
- Discovery metadata (OIDC + cloud discovery) is also cached in Redis to avoid repeated round-trips to Azure on every cold start.

**Known limitation / planned change:**
- The team is mid-transition to Google OAuth + Google Calendar API. The `[TODO: Update when complete transition to Google]` note in api-reference.md tracks this. The Azure MSAL code in `app/auth/` and the Microsoft Graph routes will be replaced or removed during this transition. See the Integration Guide for what the Google migration will look like.

---

## Token Cache: Redis <!-- [TODO: Update this once implementing Google Calendar route] -->

**Decision:** Use Redis as the MSAL distributed token cache, rather than a database table or filesystem cache.

**Why:**
- Redis `GET`/`SET` operations are O(1) and in-memory — token lookups on every authenticated request stay fast.
- Redis supports TTL-based expiry natively, which aligns with MSAL token lifetimes.
- The same Redis instance also stores OIDC/cloud discovery metadata (see above).

**Trade-offs:**
- Redis is an additional infrastructure dependency. In development, `dump.rdb` at the repo root is the local Redis persistence file. In production, a hosted Redis instance (URL set via `NEXT_PUBLIC_REDIS_PROD_URL`) is required.
- Redis is only used for the auth token cache. It is not used for application data caching. TanStack React Query was installed with the intent to cache API responses client-side, but `useQuery` is never called anywhere — the library is currently dead weight.

---

## Zoom Integration <!-- [TODO: Update Zoom account rotation] -->



**Decision:** Integrate directly with the Zoom API using Server-to-Server OAuth (account credentials grant), proxied through our own Next.js API routes.

**Why:**
- ICR runs meetings that can be in-person, Zoom-only, or hybrid. When a meeting is created or updated in the platform, the Zoom meeting needs to be created/updated atomically.
- Server-to-Server OAuth (account credentials) was chosen over user-level OAuth because the Zoom meetings are owned by ICR's organizational accounts, not by individual board members.

**Multi-account design (in progress):**
- Zoom prevents a single account from hosting multiple simultaneous meetings. ICR has multiple Zoom accounts (ZOOM1, and future ZOOM2, ZOOM3, etc.) to allow concurrent meetings.
- Currently only ZOOM1 is implemented. The rotation logic — checking which account is free at a given time and selecting it — is listed as a summer deliverable.
- Environment variables follow the pattern `ZOOM1_CLIENT_ID`, `ZOOM1_CLIENT_SECRET`, `ZOOM1_ACCOUNT_ID`, leaving room to add `ZOOM2_*`, `ZOOM3_*`.

**Trade-offs:**
- Token generation happens on every Zoom API call (no token is cached). For the current scale, this is fine. If Zoom API call volume increases, caching the short-lived Zoom access token in Redis would reduce latency.

---

## Microsoft Graph Integration <!-- [TODO] -->

**Decision:** Use Microsoft Graph API to read groups and calendars from the ICR Azure AD organization.

**Why:**
- ICR groups (AA, NA, etc.) are modeled as Azure AD groups, each with an associated calendar. The platform needs to read these calendars to support bidirectional calendar sync.

**Current state:**
- Token acquisition and group/calendar fetch are implemented.
- Bidirectional sync (writing meeting data back to the group calendar and keeping the MongoDB record in sync) is not yet implemented — it's a summer deliverable.
- This entire integration will be replaced by Google Calendar API as part of the transition to Google Auth.

---

## Leasing Documents: CSV Export (not PandaDocs API)

**Decision:** The "PandaDocs" button exports a CSV file rather than calling the PandaDocs API directly.

**Why:**
- PandaDocs has a bulk-send feature that accepts a CSV to generate multiple lease documents at once. The workflow is: export CSV from the platform → upload to PandaDocs → PandaDocs sends leases to groups.
- A direct PandaDocs API integration was initially planned, but this would require a higher-tier account that would result in higher operational cost.

**What the CSV contains:**
- One row per meeting scheduled in the first week of July (the start of ICR's lease year, July 1 – June 30).
- Fields include group name, contact email, room, rate, billable hours, and a pre-written email message body.
- Room rates are hardcoded in `PandaDocButton.tsx` — if ICR changes rates, that file needs to be updated.

**Trade-offs:**
- The manual upload step is a friction point. A future team should evaluate whether the PandaDocs API is worth integrating directly, or whether this should be implemented differently.

---

## Hosting: Vercel

**Decision:** Deploy the Next.js app on Vercel.

**Why:**
- Vercel has zero-config Next.js support: automatic builds on push to `master`, preview deployments for PRs, and serverless function execution for API routes.
- No Docker or server management required.

**Trade-offs:**
- The System Design document mentions Docker for backend deployment, but that approach was not adopted. The current app is entirely serverless on Vercel.
- Vercel's free tier has function execution time limits (10s per invocation). Long-running operations (e.g., bulk calendar sync) may need to be broken into smaller requests or moved to a background job.

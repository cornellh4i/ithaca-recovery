# Testing

How this project verifies itself: three automated tiers that run on every push via CI, plus a
short manual checklist for the handful of things automation can't cover. If you're onboarding
onto the repo, this doc is the walkthrough; if you're about to sign off a release, see
[`manual-test-script-template.md`](manual-test-script-template.md).

## The three tiers

All test code lives under `frontend/tests/`, split by tier:

```text
frontend/tests/
  unit/         # pure functions, no I/O
  integration/  # route handlers against a real (in-memory) database
  e2e/          # full app, real browser, real dev server
```

**Unit** (`tests/unit/`, `yarn test:unit`) — pure functions in isolation: no database, no network,
no rendering. `timeUtils.test.ts`, `meetingOccurrences.test.ts`, `googleCalendar.test.ts`,
`googleTokenRefresh.test.ts` (mocks `fetch`), `authCookies.test.ts`. Also `routeGuards.test.ts` — a
structural check, not a pure-function test, but still no DB/network: it
parses every `route.ts` under `app/api` into a TypeScript AST and confirms each one either has a
real `requireRole(...)` guard (a variable assigned from the call, checked with `instanceof
Response`, returning on failure) or is explicitly allowlisted as intentionally public. Catches a
route that forgot the check — or imported `requireRole` without actually calling it — that a
text/grep-based check would miss. Runs in seconds; reach for this whenever logic (or in this case,
a structural invariant) can be verified from source alone.

`proxy.test.ts` is also here, and is the first test in this repo to import `next/server`
directly — it constructs a `NextRequest` with an `encode()`d session cookie (same technique the
e2e auth helper uses) and calls the exported `proxy` function in-process, no dev server
needed. It mocks `services/googleTokenRefresh.ts` to assert `proxy.ts`'s own logic (when it
decides to refresh, what it writes to `Set-Cookie`) independently of the real Google network call,
which `googleTokenRefresh.test.ts` covers separately.

**Integration** (`tests/integration/`, `yarn test:integration`) — a Next.js route handler talking
to a *real* database (an in-memory MongoDB replica set via `mongodb-memory-server`), with external
services (Zoom, Google Calendar) mocked via `jest.mock()` for precise control over timing and
return values. Answers "does this route correctly orchestrate DB + services?" without browser
overhead.

**E2E** (`tests/e2e/`, `yarn test:e2e`) — Playwright driving a real browser against a real spawned
`next dev` server: UI, routing, API routes, database, end to end. This is where UI-wiring bugs
actually get caught (a broken click handler, a locator that stops matching, a race between two
rapid clicks). It's also where most of this suite's weight is — see below for why.

### How auth works in tests

There's no dev-login bypass. Instead, tests mint a real `next-auth.session-token` JWT directly
(via `next-auth/jwt`'s `encode()` with `NEXTAUTH_SECRET`) and inject it with Playwright's
`context.addCookies()`. `authConfig.ts`'s `jwt` callback re-reads `role` from the `Admin`
collection on every request, so the minted token only needs `email`/`sub` to match a seeded
`Admin` row — role comes entirely from what's seeded, not from the token.

### How external services (Zoom, Google Calendar) are handled

Playwright can't intercept server-side `fetch`/`googleapis` calls — they run in the Next.js server
process, not the browser — so route interception isn't an option. Instead, the suite leans on the
app's own fail-soft gating to reach deterministic states with **zero real network calls**:

| Desired state | How |
|---|---|
| Zoom sync not attempted | Don't set `zoomRoom` on the meeting |
| Zoom sync attempted, fails (`zoomSyncStatus: 'error'`) | Set `zoomRoom`, leave Zoom env vars unset |
| GCal sync not attempted | Mint the session with no `accessToken` |
| GCal sync attempted, fails (`syncStatus: 'error'`) | Mint a fake `accessToken`, leave the calendar-ID env vars unset |

For "renders a successfully-synced meeting" assertions, the end state is seeded directly
(`zoomSyncStatus: 'synced'`, a real-looking `zoomLink`, etc.) rather than driving an actual
successful sync — those are rendering assertions, not integration assertions. This is also why
CI's `e2e` job runs with no Google/Zoom credentials configured at all: the whole suite is designed
around the failure paths, on purpose.

This is a deliberate gap, not an oversight — see the manual checklist for the cases that actually
need live credentials (real Zoom meetings getting created, real Google Calendar events appearing).

### Provisional tests

Some features referenced in the manual script aren't built yet (conflict detection, XLSX import,
the suspend workflow's read path). Rather than skip testing them, `tests/e2e/provisional.spec.ts`
(plus one Jest integration test) locks in their *current* stub behavior — e.g. the Diagnostics
conflicts panel always renders empty because `GET /api/admin/diagnostics` hardcodes
`conflicts: []`. These are tagged `@provisional-<ticket>` and titled `[PROVISIONAL:X]`, with a
comment pointing at the exact stub line, so whoever ships the real feature finds the test
immediately and knows to rewrite it — not leave it silently asserting the old absence of behavior.

## Running locally

```
yarn test:unit          # seconds, no setup
yarn test:integration   # spins up an in-memory Mongo replica set
yarn test:e2e           # spawns a real `next dev` server + Chromium
```

`test:e2e` needs Playwright's browser binaries installed once: `npx playwright install --with-deps chromium`.

## CI

[`.github/workflows/test.yml`](../../../.github/workflows/test.yml) runs on every push/PR to
`main`/`master`, as three separate jobs (`unit`, `integration`, `e2e`) rather than one — a slow or
flaky e2e run shouldn't hold up the fast unit-test signal on a PR. The `e2e` job deliberately has
no Google/Zoom secrets configured, per the fail-soft design above, so it never makes a real
external call. On failure it uploads Playwright's trace files (`test-results/`) as a downloadable
artifact for debugging a CI-only failure.

Note that CI and the Vercel deployment are independent by default — a red `test.yml` run doesn't
block a Vercel deploy on its own. If deploys need to be gated on tests passing, that's a GitHub
branch-protection rule (require the CI checks before merging to `main`/`master`), not a Vercel
setting.

## What's still manual

`tests/e2e/` only runs Chromium, and none of the automated tiers touch real Zoom/Google
credentials. What's left — real OAuth login, live Zoom/Google Calendar behavior,
cross-browser/responsive rendering, real-time behavior playing out over minutes — is covered by
[`manual-test-script-template.md`](manual-test-script-template.md), which has been trimmed down to
just those cases plus the pre-release sign-off ritual. Each section there is cross-referenced
against the automated spec file that covers everything else in that area.

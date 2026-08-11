# About Testing

How this project verifies itself: four automated tiers, all of which run in CI on every push,
plus a short manual checklist for the handful of things automation can't cover. If you're
onboarding onto the repo, this doc is the walkthrough; if you're about to sign off a release, see
[Manual Test Script](manual-test-script-template.md). For the *why* behind the
overall testing philosophy (fail-soft external-service gating, Playwright-primary design,
provisional tests) see
[Technical Decisions](../../02-handoff/technical-decisions.md#testing-strategy-playwright-primary-jest-for-narrower-jobs).

## The four tiers

All test code lives under `frontend/tests/`, split by tier:

```text
frontend/tests/
  unit/         # pure functions, no I/O
  component/    # individual components in isolation (Jest + React Testing Library), no server/DB
  integration/  # route handlers against a real (embedded) Postgres database
  e2e/          # full app, real browser, real dev server
```

**Unit** (`tests/unit/`, `yarn test:unit`) — pure functions in isolation: no database, no network,
no rendering. Also `routeGuards.test.ts` — a structural check, not a pure-function test: it parses
every `route.ts` under `app/api` into a TypeScript AST and confirms each one either has a real
`requireRole(...)` guard or is explicitly allowlisted as intentionally public. And `proxy.test.ts`,
which constructs a `NextRequest` and calls the exported `proxy` function in-process to test its
cookie-refresh logic without a real dev server.

**Component** (`tests/component/`, `yarn test:component`) — individual React components rendered
in isolation (Jest + React Testing Library, `jsdom`), no server or database. Narrower than
integration, faster than e2e — useful for a component with enough internal branching (conditional
rendering, prop combinations) to be tedious to exercise fully through a real browser.
Runs in CI as its own `component` job in `.github/workflows/test.yml` (added 2026-08-10, after a
regression merged to `master` unnoticed while this tier was local-only — see the
technical-decisions.md link above).

**Integration** (`tests/integration/`, `yarn test:integration`) — a Next.js route handler talking
to a *real* database (`embedded-postgres` — a real `postgres` binary run as a plain child process,
no Docker, no network), with external services (Zoom, Google Calendar) mocked via `jest.mock()`
for precise control over timing and return values. Answers "does this route correctly orchestrate
DB + services?" without browser overhead.

**E2E** (`tests/e2e/`, `yarn test:e2e`) — Playwright driving a real browser against a real spawned
`next dev` server: UI, routing, API routes, database, end to end. This is where UI-wiring bugs
actually get caught (a broken click handler, a locator that stops matching, a race between two
rapid clicks). It's also where most of this suite's weight is — see technical-decisions.md for why.

### How auth works in tests

There's no dev-login bypass. Instead, tests mint a real `next-auth.session-token` JWT directly
(via `next-auth/jwt`'s `encode()` with `NEXTAUTH_SECRET`) and inject it with Playwright's
`context.addCookies()`. `authConfig.ts`'s `jwt` callback re-reads `role` from the `Admin`
table on every request, so the minted token only needs `email`/`sub` to match a seeded
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
| GCal sync attempted, fails (`googleSyncStatus: 'error'`) | Mint a fake `accessToken`, leave the calendar-ID env vars unset |

For "renders a successfully-synced meeting" assertions, the end state is seeded directly
(`zoomSyncStatus: 'synced'`, a real-looking `zoomLink`, etc.) rather than driving an actual
successful sync — those are rendering assertions, not integration assertions. This is also why
CI's `e2e` job runs with no Google/Zoom credentials configured at all: the whole suite is designed
around the failure paths, on purpose.

This is a deliberate gap, not an oversight — see the manual checklist for the cases that actually
need live credentials (real Zoom meetings getting created, real Google Calendar events appearing).

### Provisional tests

A feature referenced in the manual script but not built yet gets a test locking in its *current*
stub/absent behavior, tagged `[PROVISIONAL:<name>]` in `tests/e2e/provisional.spec.ts`, with a
comment pointing at the exact stub line — so whoever ships the real feature finds the test
immediately and knows to rewrite it, rather than it silently asserting the old absence of behavior
forever. `provisional.spec.ts` is currently an empty shell — every feature it originally covered
has since been resolved (two shipped, one canceled entirely) — see
[Technical Decisions](../../02-handoff/technical-decisions.md#testing-strategy-playwright-primary-jest-for-narrower-jobs)
for the specifics.

## Running locally

```bash
yarn lint                # ESLint
yarn lint:css            # stylelint — .scss files only, not part of plain `yarn lint`
yarn test:unit           # seconds, no setup
yarn test:component      # seconds, no setup
yarn test:integration    # spins up an embedded Postgres instance
yarn test:e2e            # spawns a real `next dev` server + Chromium
yarn test:all            # lint && lint:css && test:unit && test:component && test:integration && test:e2e
```

`test:e2e` needs Playwright's browser binaries installed once: `yarn playwright install --with-deps chromium`.

## CI

[`.github/workflows/test.yml`](https://github.com/cornellh4i/ithaca-recovery/blob/master/.github/workflows/test.yml) runs on every push/PR to
`main`/`master`, as separate jobs: `lint` (ESLint + stylelint), `unit`, `component`, `integration`,
`e2e`, plus `doc-freshness` (fails if the README/docs cite a stale Node/Next version) — a slow or
flaky e2e run shouldn't hold up the fast unit-test signal on a PR.
The `e2e` job deliberately has no Google/Zoom secrets configured, per the fail-soft design above,
so it never makes a real external call. On failure it uploads Playwright's trace files
(`test-results/`) as a downloadable artifact for debugging a CI-only failure.

Note that CI and the Vercel deployment are independent systems — a red `test.yml` run doesn't
itself block a Vercel deploy. Separately, `master` **is** protected: merging requires a passing
run of `title-lint`, `commitlint`, `lint`, `unit`, `integration`, and `e2e`, plus one approving
review (repo Admins can bypass this) — `component` and `doc-freshness` run but aren't part of that
required set yet. See [Deployment and Rollback](../../02-handoff/deployment-and-rollback.md) §1-2
for the full picture, including why CI passing and a production deploy happening aren't the same
guarantee.

## What's still manual

`tests/e2e/` only runs Chromium, and none of the automated tiers touch real Zoom/Google
credentials. What's left — real OAuth login, live Zoom/Google Calendar behavior,
cross-browser/responsive rendering, real-time behavior playing out over minutes — is covered by
[Manual Test Script](manual-test-script-template.md), which has been trimmed down to
just those cases plus the pre-release sign-off ritual.

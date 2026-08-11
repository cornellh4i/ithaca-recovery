# Local Setup

A guided walkthrough for a new developer: clone the repo, get the app running locally, run the
test suite, and make one small, safe change end to end. For the full picture, see
[Project Structure](project-structure.md) (architecture), [API Reference](api-reference.md)
(every route), and [Integration Guides](integration-guides.md) (per-service setup).

> [!TIP]
> **Shortcut for the current H4I team:** every env var
> already exists for the shared dev environment. Ask the previous team for the
> existing `.env` instead of provisioning your own from scratch, then skip to
> [3. Run it](#3-run-it).

## 1. Clone and install

```bash
git clone <repo-url>
cd ithaca-recovery/frontend
yarn install
```

`yarn install` also runs `prisma generate` automatically (`postinstall` script) — you don't need a
separate step for that.

## 2. Get a database

You need a Postgres connection string. The fastest path for local development is a free
[Neon](https://neon.tech) project:

1. Create a Neon account and a new project (any region).
2. Copy the **pooled** connection string from the Neon dashboard (the one with `-pooler` in the
   hostname).
3. Create `frontend/.env` (never commit it) with at least:
   ```env
   DATABASE_URL="<your pooled Neon connection string>"
   NEXTAUTH_SECRET="dev-secret-anything-works-locally"
   NEXTAUTH_URL="http://localhost:3000"
   ```
4. Apply the schema:
   ```bash
   yarn prisma migrate deploy
   ```

This is enough to run the app and most of the test suite. You do **not** need real Google/Zoom
credentials yet — the app is built to fail soft when they're missing (see
[Testing](testing/README.md)), and most local development doesn't touch those paths
directly. See [Environment Variables](environment-variables.md) for the full variable list and
[Integration Guides](integration-guides.md) for setting up Google OAuth/Calendar and Zoom when
you actually need them (e.g. testing a sync-related change against real services).

## 3. Run it

```bash
yarn dev
```

Opens at [http://localhost:3000](http://localhost:3000). Without `GOOGLE_CLIENT_ID`/`_SECRET` set,
sign-in won't work yet — that's expected at this point. You can still browse `/signage`, which
requires no auth.

> [!NOTE]
> The in-app docs search box (Pagefind) only indexes on `yarn build`, not `yarn dev` — in local
> dev it'll silently return nothing no matter what you type. That's expected, not broken; search
> a deployed instance (or run a local `yarn build && yarn start`) if you need to actually test it.

To actually sign in locally, you need a Google OAuth app and at least one seeded `Admin` row — see
[Integration Guides §2](integration-guides.md#2-google-oauth-nextauth)'s "Bootstrapping the
first Admin" section. (Skip this if you used the shared dev `.env` from the shortcut above —
that already has a working `GOOGLE_CLIENT_ID`/`_SECRET` and an admin account you can sign in with.)

## 4. Run the test suite

```bash
yarn lint               # ESLint, seconds
yarn lint:css           # stylelint, seconds — separate from `yarn lint`, .scss files only
yarn test:unit          # seconds, no setup beyond what you already have
yarn test:component     # seconds, no setup
yarn test:integration   # spins up its own embedded Postgres instance — separate from your Neon dev DB
yarn test:e2e           # needs `yarn playwright install --with-deps chromium` once
```

All six should pass on a clean clone with no further setup — the test suites don't use your
`.env`'s `DATABASE_URL` at all (`integration`/`e2e` spin up their own embedded Postgres instances).
If something fails here before you've changed any code, flag and investigate immediately.

## 5. Make a first change

Either make a small edit (e.g. add a one line comment), or work on a small issue — good place to start is the repo's own
[*good first issue*s](https://github.com/cornellh4i/ithaca-recovery/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

1. Make an edit.
2. `yarn test:all` — runs lint, lint:css, unit, component, integration, and e2e in sequence
   (`lint:css` covers any `.scss` file you touched too, no separate step needed). This is the same
   set of tiers CI runs (see [Testing](testing/README.md)).
3. `git diff` to see your change, then `git checkout -- <file>` to revert it if it was just practice.

## Where to go next

- [Project Structure](project-structure.md) — the full architecture map
- [API Reference](api-reference.md) — every API route
- Pick something from the project roadmap or an open issue, and use `git blame`/`git log` on
  nearby code before changing it — this codebase leans heavily on inline comments explaining *why*
  something is the way it is, not just what it does. Read those before assuming something's
  accidental.

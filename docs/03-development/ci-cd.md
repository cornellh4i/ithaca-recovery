# CI/CD

What runs automatically in this repo, and why. For the actual test *tiers* (what `unit`/
`component`/`integration`/`e2e` each cover), see [Testing](testing/README.md) — this doc is about
the GitHub Actions workflows themselves and how they fit together. For the human side (review,
merge, deploy, rollback), see
[Deployment and Rollback](../02-handoff/deployment-and-rollback.md).

All workflows live in [`.github/workflows/`](https://github.com/cornellh4i/ithaca-recovery/tree/master/.github/workflows).

> [!NOTE]
> There's no separate "CD" workflow in this repo. Deploys are Vercel's own git integration
> reacting to a push to `master` — not a GitHub Actions job. See
> [Deployment and Rollback §2](../02-handoff/deployment-and-rollback.md#2-deploy-to-production).

## Test suite — `test.yml`

Runs on every push/PR to `main`/`master` as separate jobs (`doc-freshness`, `lint`, `unit`,
`component`, `integration`, `e2e`), so a slow or flaky e2e run doesn't hold up the fast unit-test
signal. Full breakdown of what each job actually tests: [Testing §CI](testing/README.md#ci).

`CHECKPOINT_DISABLE: "1"` is set repo-wide in this workflow's `env` — Prisma CLI otherwise pings
`checkpoint.prisma.io` after every command and can hang a job if that ping stalls.

## Commit and PR title linting — `commitlint.yml`, `pr-title-lint.yml`

Both enforce [Conventional Commits](https://www.conventionalcommits.org/) formatting
(`type(scope): subject`, e.g. `fix(calendar): position the current-time line in ET`) — rules
configured in `frontend/config/commitlint.config.mjs` (extends
`@commitlint/config-conventional`).

- `commitlint.yml` lints every commit on a PR individually
  (`commitlint --from <base sha> --to <head sha>`), so a non-conventional commit fails even if
  it's later squashed into a conventional PR title.
- `pr-title-lint.yml` lints the PR title itself, using
  [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request).
  This matters beyond style: a squash-merge inherits the PR title as the merge commit's message,
  so a non-conventional title still lands in `master`'s history even when every individual commit
  was compliant.

## Automated code review — CodeRabbit

Not a GitHub Actions workflow — a separate GitHub App, configured via
[`.coderabbit.yaml`](https://github.com/cornellh4i/ithaca-recovery/blob/master/.coderabbit.yaml)
at the repo root. Auto-reviews every PR with inline comments and a summary, except PRs opened by
`dependabot[bot]` (already gated by CI + the auto-merge policy below — a review there is just
noise). It also suggests a Conventional-Commits-compliant title on open, mirroring the same rules
`commitlint.yml`/`pr-title-lint.yml` enforce.

> [!NOTE]
> Auto-review only fires for PRs based on the repo's default branch. A PR stacked on top of
> another PR (base branch isn't `master`) needs a manual `@coderabbitai review` comment on that PR
> to trigger one.

## Security scanning — `codeql.yml`

[CodeQL](https://codeql.github.com/) static analysis on every push/PR to `main`/`master`, plus a
weekly scheduled run (Sundays 01:30 UTC) to catch anything a new advisory flags in code that
hasn't changed recently. Currently scans `javascript-typescript` only. Findings post to the repo's
**Security → Code scanning alerts** tab, not as PR check failures.

## Dependency updates — `dependabot.yml`, `dependabot-auto-merge.yml`

[`dependabot.yml`](https://github.com/cornellh4i/ithaca-recovery/blob/master/.github/dependabot.yml)
opens weekly update PRs for two ecosystems, grouped differently on purpose:

- **`frontend/` npm packages** — patch and minor bumps are grouped into one `safe-updates` PR;
  major bumps stay individual. `dependabot-auto-merge.yml` watches for the `safe-updates` group
  specifically and runs `gh pr merge --auto --squash` on it — that still waits on every required
  status check (§Branch protection below), it just removes the need for a human to click merge on
  routine bumps.
- **GitHub Actions versions** (`.github/workflows/*`) — never auto-merged, regardless of semver
  level. Action version bumps don't reliably follow semver for breaking changes (an
  `actions/checkout` major once broke fork-PR checkout under `pull_request_target` despite looking
  like a routine bump), so every one of these gets a human read of the diff.

## Scheduled maintenance bots — `calver-bump.yml`, `bump-node-version.yml`

Both run on the same monthly schedule (1st of the month, 09:00 UTC) plus `workflow_dispatch` for a
manual run, and both open a PR rather than pushing directly:

- **`calver-bump.yml`** — bumps `frontend/package.json`'s CalVer version (`YYYY.M.0`) when the
  year/month has changed since the last recorded version. Patch resets to `0` at the start of each
  month; a same-month re-release needs a manual patch bump.
- **`bump-node-version.yml`** — checks Node's current Active LTS against the version pinned in
  `frontend/.nvmrc`, and if it's moved on, updates `.nvmrc`, `package.json`'s `engines.node`, and
  `test.yml`'s `node-version` together in one PR. The PR body is a deliberate reminder to confirm
  [Vercel's supported Node.js runtime versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
  include the new major before merging — Vercel has lagged behind a fresh LTS release before.

## Labels — `label-from-checklist.yml`, `sync-labels.yml`

- **`label-from-checklist.yml`** — re-derives a PR/issue's `scope:`/`type:`/`priority:` labels
  from whichever checkboxes are checked in its body, every time the body is edited (not just on
  open), so unchecking a box removes the label too. Only ever touches the labels it manages —
  never `status:`, `good first issue`, or anything applied by hand.
- **`sync-labels.yml`** — keeps the repo's `type:`/`scope:`/`priority:`/`status:` labels
  themselves in sync with
  [`.github/labels.yml`](https://github.com/cornellh4i/ithaca-recovery/blob/master/.github/labels.yml),
  triggered whenever that file changes on `master` (plus manual `workflow_dispatch`). Runs with
  `skip-delete: true` since `labels.yml` only owns those prefixed labels, not GitHub's or
  Dependabot's defaults (`bug`, `enhancement`, `dependencies`, ...).

## Branch protection

`master` requires a passing run of `title-lint`, `commitlint`, `lint`, `unit`, `integration`, and
`e2e`, plus one approving review, before a PR can merge (repo Admins can bypass this — see
[Deployment and Rollback §1](../02-handoff/deployment-and-rollback.md#1-review-and-test-before-merge)
for the human-facing version of this rule). `component`, `doc-freshness`, and `CodeQL` all run on
every PR but aren't part of that required set yet.

## Where to go next

- [Testing](testing/README.md) — what each test tier actually covers, and what's still manual
- [Deployment and Rollback](../02-handoff/deployment-and-rollback.md) — the merge → deploy →
  rollback path once CI is green
- `frontend/config/commitlint.config.mjs` — the Conventional Commits rules `commitlint.yml`
  enforces

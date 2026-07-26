# Documentation

Organized by audience. Pick the folder that matches who you are, not necessarily the order below.

## [`01-user-guide/`](01-user-guide/) — using the platform

For ICR board members creating, editing, and managing meetings day to day.

- [`user-guide.md`](01-user-guide/user-guide.md) — full walkthrough: creating/editing/deleting meetings, recurrence, filters, exports, signage, admin user management, troubleshooting, FAQs.

## [`02-handoff/`](02-handoff/) — ownership, operations, and continuity

For ICR leadership and whoever maintains this application next — assumes no coding background.

- [`README.md`](02-handoff/README.md) — start here for this section
- [`ownership-and-access.md`](02-handoff/ownership-and-access.md) — who owns GitHub/Vercel/MongoDB, what access ICR has, long-term responsibility after the current team transitions
- [`credentials-and-integrations.md`](02-handoff/credentials-and-integrations.md) — every credential the app depends on, who controls it, how changes are coordinated
- [`deployment-and-rollback.md`](02-handoff/deployment-and-rollback.md) — how code changes go from PR to production, and how a bad deploy gets rolled back
- [`backups-and-recovery.md`](02-handoff/backups-and-recovery.md) — how MongoDB data is backed up and how to recover from data loss
- [`support-process.md`](02-handoff/support-process.md) — how to report a problem, what to include, who responds, and how fast
- [`contingency-transfer.md`](02-handoff/contingency-transfer.md) — how to transfer the whole system to ICR or another maintainer if Hack4Impact can no longer support it
- [`technical-decisions.md`](02-handoff/technical-decisions.md) — why the stack and architecture are built the way they are

## [`03-development/`](03-development/) — working on the codebase

For developers (current or future H4I teams) writing code against this app.

- [`project-structure.md`](03-development/project-structure.md) — tech stack, folder layout, data models, auth flow
- [`api-reference.md`](03-development/api-reference.md) — every API route, request/response shapes
- [`integration-guides.md`](03-development/integration-guides.md) — step-by-step setup for every external service (env vars, MongoDB, Google OAuth, Google Calendar, Zoom, PandaDocs, Vercel)
- [`testing/README.md`](03-development/testing/README.md) — how the automated test suite (unit/integration/e2e) and CI work
- [`testing/manual-test-script-template.md`](03-development/testing/manual-test-script-template.md) — manual pre-release checklist (what CI can't cover)

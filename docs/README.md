# Resources

Welcome to the documentation hub for the **Ithaca Recovery Management System**. For ease of navigation,
this hub has been organized by its audience:
- [User Guide](#user-guide) for everyday users of the system;
- [Handoff](#handoff) for the ICR leadership and this application maintainer; and
- [Development](#development) for developer teams writing code for this app.

## [User Guide](01-user-guide/)

For ICR board members creating, editing, and managing meetings day to day. Itself organized into
four kinds of content — see [User Guide index](01-user-guide/README.md) for more details:
- [Tutorials](01-user-guide/tutorials/) — guided walkthroughs, start here if you're new
- [How-to guides](01-user-guide/how-to/) — steps for a specific task
- [Reference](01-user-guide/reference/) — roles, fields, troubleshooting, printable card
- [Explanation](01-user-guide/explanation/) — why things work the way they do

## [Handoff](02-handoff/)

For ICR leadership and whoever maintains this application next. Assumes little to no technical background. See [Handoff index](02-handoff/README.md) for a more detailed overview.

- [Ownership and Access](02-handoff/ownership-and-access.md) — who owns GitHub/Vercel/Neon, what access ICR has, long-term responsibility after the current team transitions
- [Credentials and Integrations](02-handoff/credentials-and-integrations.md) — every credential the app depends on, who controls it, how changes are coordinated
- [Deployment and Rollback](02-handoff/deployment-and-rollback.md) — how code changes go from PR to production, and how a bad deploy gets rolled back
- [Backups and Recovery](02-handoff/backups-and-recovery.md) — how Postgres data is backed up and how to recover from data loss
- [Support Process](02-handoff/support-process.md) — how to report a problem, what to include, who responds, and how fast
- [Contingency and Future Transfer](02-handoff/contingency-transfer.md) — how to transfer the whole system to ICR or another maintainer if Hack4Impact can no longer support it
- [Technical Decisions](02-handoff/technical-decisions.md) — why the stack and architecture are built the way they are

## [Development](03-development/)

For developers (current or future H4I teams) writing code against this app — see the
[Development index](03-development/README.md) for how it's organized:
- [Local Setup](03-development/local-setup.md) — new here? start with this guided walkthrough
- [Project Structure](03-development/project-structure.md) — tech stack, folder layout, data models, auth flow
- [API Reference](03-development/api-reference.md) — every API route, request/response shapes
- [Environment Variables](03-development/environment-variables.md) — every env var, what it's for
- [Backup Infrastructure Setup](03-development/backup-infra-setup.md) — reproducible provisioning checklist for the backup pipeline's cloud resources (GCP projects, buckets, R2, Workload Identity Federation)
- [Integration Guides](03-development/integration-guides.md) — step-by-step setup for every external service (Postgres, Google OAuth, Google Calendar, Zoom, PandaDoc, Vercel)
- [CI/CD](03-development/ci-cd.md) — what runs automatically on pushes and PRs
- [Docs Site](03-development/docs-site.md) — how docs/ becomes the in-app /docs page, and the checklist for adding or moving a doc
- [Testing](03-development/testing/README.md) — how the automated test suite (lint/unit/component/integration/e2e) and CI work
- [Manual Test Script](03-development/testing/manual-test-script-template.md) — manual pre-release checklist (for what CI can't cover)

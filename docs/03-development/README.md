# Development Documentation

For developers (current or future H4I teams) writing code against this app. Organized by what you are trying to do:

- **New to this repo?** Start with [Local Setup](local-setup.md) — a guided walkthrough to
  get running locally and make your first change.
- **How do I configure/set up X?** [Integration Guides](integration-guides.md) — step-by-step
  setup for Postgres, Google OAuth, Google Calendar, Zoom, PandaDoc, and Vercel.
- **What environment variable does X need?** [Environment Variables](environment-variables.md)
  — the full reference table.
- **How is the codebase organized? What models/routes/components exist?**
  [Project Structure](project-structure.md) (architecture, folder layout, data models,
  auth flow) and [API Reference](api-reference.md) (every API route, request/response
  shapes).
- **What exactly does creating/editing/deleting/suspending a meeting do, end to end?**
  [Meeting Lifecycle Flows](meeting-lifecycle-flows.md) — per-operation DB writes, deferred
  sync effects, and the invariants at the seams.
- **Why is it built this way?** [Technical Decisions](../02-handoff/technical-decisions.md)
  — every significant architecture decision and the reasoning behind it. Read this before
  proposing a change to the stack or a core pattern.
- **How was the backup pipeline's cloud infrastructure provisioned?**
  [Backup Infrastructure Setup](backup-infra-setup.md) — reproducible provisioning checklist
  (GCP projects, buckets, R2, WIF).
- **How do I add or move a doc on the /docs page?** [Docs Site](docs-site.md).
- **How does testing work? How do I run the suite?** [Testing](testing/README.md).
  Before a release, see [Manual Test Script](testing/manual-test-script-template.md)
  for what automation can't cover.
- **What runs automatically on a push/PR? How do dependency bumps, release versioning, and
  labeling work?** [CI/CD](ci-cd.md) — every GitHub Actions workflow in the repo, and how they
  fit together.

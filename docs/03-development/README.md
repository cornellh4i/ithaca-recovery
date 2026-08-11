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
- **Why is it built this way?** [Technical Decisions](../02-handoff/technical-decisions.md)
  — every significant architecture decision and the reasoning behind it. Read this before
  proposing a change to the stack or a core pattern.
- **How does testing work? How do I run the suite?** [Testing](testing/README.md).
  Before a release, see [Manual Test Script](testing/manual-test-script-template.md)
  for what automation can't cover.
- **What runs automatically on a push/PR? How do dependency bumps, release versioning, and
  labeling work?** [CI/CD](ci-cd.md) — every GitHub Actions workflow in the repo, and how they
  fit together.

> [!NOTE]
> Adding a new page under `docs/`? It also needs an entry in the hand-curated `MANIFEST` array in
> `frontend/build-scripts/generate-docs-content.mjs` — a file that exists on disk but isn't in
> that list won't appear on the published site, and a manifest entry whose file is missing fails
> the build. There's no automated check for this drift yet.

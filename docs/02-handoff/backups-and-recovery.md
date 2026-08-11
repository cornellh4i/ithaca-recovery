# Backups and Recovery [STUB]

Answers the handoff meeting item: *confirm how Postgres data is backed up, how frequently, how long
backups are retained, and how the application would be restored after data loss, corruption, or a
production failure.*

---

## Backup design: three named copies

Backups are organized as three distinct, independent copies — if one is unavailable or fails, the
others don't depend on it:

| | What it is | Status |
|---|---|---|
| **Copy A** | Neon's own built-in Point-in-Time Recovery (PITR) | Already exists — it's a Neon platform feature, not something this app built |
| **Copy B** | Automated `pg_dump` snapshots, encrypted and uploaded to a private GCS bucket | Designed, paused before implementation — not live yet |
| **Copy C** | Manual **Export Meetings** XLSX download (Admin → Export, Super Admin only — see the user guide's export how-to) | Exists today, but manual — a Super Admin has to remember to run it |

**Today, only Copy A and Copy C exist.** Copy A is automatic (Neon runs it regardless of anything
in this repo) but its retention window depends on the Neon plan/tier — [TODO: confirm the actual
PITR retention window from the Neon dashboard/plan]. Copy C is manual and easy to forget. Copy B —
the piece meant to close that gap with something automated, off-Neon, and encrypted — is designed
but not built. This is a real gap, not a documented-but-fine state — flag it as such if raised in
the handoff meeting rather than implying it's solved.

## Copy B: planned approach (designed, paused before implementation)

Designed 2026-08-09, ready to build — not a live mechanism yet, so nothing below is true today:

- **Mechanism:** a GitHub Actions workflow (`.github/workflows/backup-db.yml`), triggered by a
  daily `schedule: cron` (07:17 UTC) and a manual `workflow_dispatch` for on-demand backups. Runs
  `pg_dump --format=custom` (PGDG-installed, pinned to Neon's Postgres major) against the
  **unpooled** Neon connection string — a separate `DATABASE_URL_UNPOOLED` secret, not the
  `-pooler` string Vercel uses, since pgbouncer's transaction-mode pooling breaks `pg_dump`'s
  session-level operations. The dump is then encrypted with `age` (asymmetric — the public key
  lives in CI as a non-secret GitHub Actions variable, safe even if it leaked, since it can only
  encrypt; the private key never touches CI or anything network-reachable) and uploaded to a
  private GCS bucket via Workload Identity Federation — no downloaded service-account key sitting
  in CI. File naming: `icr-db-<UTC-ISO8601-compact>.dump.age`.
  - **Why GitHub Actions instead of a Vercel Cron Job hitting an API route:** Vercel's serverless
    runtime can't shell out to `pg_dump` (no way to add the binary without a custom Docker image,
    which plain Next.js/Vercel deployment doesn't support) — GitHub Actions' `ubuntu-latest`
    runner can install it directly.
  - This is the app's first scheduled job of any kind — a deliberate one-time precedent, not a
    pattern to reach for casually elsewhere.
- **Retention: Grandfather-Father-Son (GFS) rotation**, not a flat expiry window — daily backups
  are kept briefly, one per week is kept longer, one per month is kept longer still:
  - **Son (daily):** every daily backup, kept 7 days.
  - **Father (weekly):** one backup per week (e.g. the Sunday run), kept 5 weeks.
  - **Grandfather (monthly):** one backup per month (e.g. the 1st-of-month run), kept 12 months.
  - [TODO: work out the concrete implementation once work resumes — GCS Object Lifecycle rules key
    off object age, not "is this the weekly/monthly one," so this likely needs either separate
    per-tier folders/prefixes that the workflow promotes into on the right day, or a small pruning
    step in the workflow itself, rather than a single flat lifecycle rule like the old 30-day
    design. Document the chosen approach in `.github/scripts/gcs-lifecycle.json` once decided, the
    same way the flat rule was originally planned to be.]
- **Restore procedure:** still explicitly future-TODO — not built yet, deliberately out of scope
  for the first implementation pass. The dump format (`pg_dump --format=custom`) was chosen
  specifically so a future restore is a plain `pg_restore` invocation with no transformation
  needed, once that script exists.
- **The `age` private key:** generated once, locally (`age-keygen`), never in CI — stored offline
  with whoever holds long-term H4I responsibility (see
  [Ownership and Access](ownership-and-access.md) §3).

> [!WARNING]
> If the `age` private key is ever lost, every existing encrypted backup becomes permanently
> unrecoverable — there is no recovery path around this by design.

**Status:** fully designed and reviewed, paused before implementation (retention design just
updated to GFS — see above) — see the project roadmap for where this sits in the sequence. The
GCP-account-level setup (bucket, WIF pool/provider, service account, IAM bindings) is a checklist
run by hand against the real production GCP project once work resumes — it needs real
project/billing IDs that don't belong in this repo.

## In the meantime

[TODO: decide an interim cadence for Copy C — e.g. "Super Admin runs Export Meetings weekly" — and
document it as the stopgap until Copy B exists]

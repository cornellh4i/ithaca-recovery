# Backups and Recovery [STUB]

Answers the handoff meeting item: *confirm how MongoDB data is backed up, how frequently, how long
backups are retained, and how the application would be restored after data loss, corruption, or a
production failure.*

---

## Current state (as of 2026-07-26)

**No automated database backup exists yet.** The only current recovery mechanism is the manual
**Export Meetings** XLSX download (Admin → Export, Super Admin only — see
[`../01-user-guide/user-guide.md`, §10](../01-user-guide/user-guide.md#10-exporting-data-admin--export)),
which a Super Admin has to remember to run. This is a real gap, not a documented-but-fine state —
flag it as such if raised in the handoff meeting rather than implying it's solved.

## Planned approach (not yet built)

Discussed 2026-07-26, not yet implemented:

- **Mechanism:** a daily Vercel Cron Job hitting an API route that reads every collection
  (`Meeting`, `RecurrencePattern`, `Admin`, `LeaseSettings`) via the existing Prisma client,
  serializes to JSON, gzips it, and uploads to Vercel Blob.
  - **Do not** shell out to the `mongodump` binary from the API route — it isn't installed in
    Vercel's serverless runtime, and there's no way to add it without a custom Docker image, which
    plain Next.js/Vercel deployment doesn't support. A driver-level export via Prisma avoids this
    entirely and is simple enough at ICR's data volume (a handful of collections, low write
    volume).
- **Retention:** keep the last 30 daily snapshots; delete anything older in the same cron run.
  Skip tiered daily/weekly/monthly retention — that's added complexity a rotating volunteer dev
  team is unlikely to maintain, and 30 days of daily granularity is generous for this app's low
  write velocity (scheduled meetings, not high-frequency transactional data).
- **Restore procedure:** [TODO once built — likely a one-off script that reads a snapshot from
  Blob and re-inserts via Prisma; document the exact command and any conflict-handling with
  existing `mid`s]

[TODO: build this — it's a real implementation task, not just a docs task. Once built, update this
section with the actual cron schedule, Blob bucket name/path convention, and restore command.]

## In the meantime

[TODO: decide an interim cadence — e.g. "Super Admin runs Export Meetings weekly" — and document it
as the stopgap until the automated cron exists]

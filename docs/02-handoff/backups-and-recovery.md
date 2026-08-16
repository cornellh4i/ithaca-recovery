# Backups and Recovery

Answers the handoff meeting item: *confirm how Postgres data is backed up, how frequently, how long
backups are retained, and how the application would be restored after data loss, corruption, or a
production failure.*

---

## Design summary

Production Postgres (Neon) is backed up four times a day by a GitHub Actions workflow
(`.github/workflows/backup-db.yml`): `pg_dump` → restore into a scratch container → structural
verification → `age`-encrypt to two independent recipients → upload to three independent storage
targets. The design satisfies the strict reading of **3-2-1-1-0** and a two-tier
**Grandfather-Father-Son (GFS)** retention scheme. This infrastructure is live.

## Storage targets

Three independent copies of every backup artifact, each written by its own create-only credential:

| Target | Account/project | Role | Immutability |
|---|---|---|---|
| **GCS-working** — `gs://icr-db-backups-prod` | production GCP project, `us-east1` | operational copy; what the admin UI lists/downloads from | none (CI is create-only; lifecycle rules are the only deletion path) |
| **GCS-archive** — `gs://icr-db-backups-archive` | separate GCP project `icr-backups-archive`, same production Google account | pure redundancy + immutability | GCS bucket-level retention policy, 400 days, unlocked |
| **R2-archive** — `icr-db-backup-r2` | Cloudflare (separate vendor) | pure redundancy + immutability + real platform diversity | R2 Bucket Lock, **Governance** mode |

Service accounts `icr-db-backup@icr-management-system` and `icr-db-backup-archive@icr-backups-archive`
hold `roles/storage.objectCreator` only (no delete, no overwrite) on their respective bucket, via
GitHub OIDC (Workload Identity Federation) — no stored service-account keys anywhere. The R2 token is
similarly scoped write-only to its one bucket.

Both GCS buckets have 7-day soft-delete active by default (a bonus safety net, not something the
design relies on).

### 3-2-1-1-0 mapping

| Rule | How this design satisfies it |
|---|---|
| **3 copies** | Production + 3 independent backups (GCS-working, GCS-archive, R2), for an artifact's entire retention life. Neon's own PITR is not counted toward this — same vendor/account/credential domain as production, shares its failure modes. |
| **2 distinct media/platforms** | R2 is a genuinely different vendor from both GCS copies. The two GCS copies contribute a second *failure domain* (separate billing/IAM/project), not a second storage technology. |
| **1 offsite** | All three targets are offsite from Neon and from each other — two clouds, two Google accounts. |
| **1 immutable** | GCS-archive (bucket retention policy) and R2-archive (Bucket Lock Governance) — neither deletable by the write-only CI credentials that produced them, even if fully compromised. |
| **0 errors** | Every run: dump → restore into a scratch container → structural verification → only then encrypt/upload. A failed run opens a GitHub Issue. Quarterly human restore drill (see below). |

**Governance, not Compliance, mode on R2's Bucket Lock.** Compliance mode can't be overridden by
anyone, including the account owner, until the retention date passes — a fat-fingered retain-until
date becomes permanently unfixable. Governance blocks the same casual/malicious deletion (the
write-only CI token still can't bypass it) while leaving the account owner a documented, logged
emergency override for its own mistakes — the more realistic failure mode for a volunteer team.

## GFS retention

| Tier | Promoted when (UTC) | Prefix | Retention (lock/effective) | Lifecycle delete age |
|---|---|---|---|---|
| Son (daily) | every run | `daily/` | GCS-working 21d · R2 lock 14d | GCS 21d · R2 delete 21d |
| Grandfather (monthly) | 1st-of-month run | `monthly/` | GCS-working 407d · GCS-archive 400d (bucket-level) · R2 lock 400d | GCS 407d · R2 delete 407d |
| — (manual only) | by hand | `permanent/` | forever | no lifecycle rule |

One dump per run is uploaded to whichever prefixes apply that run — always `daily/`, plus `monthly/`
on the 1st. Not a later move or re-dump: the same bytes go to an additional prefix in the same run.
This is required because lifecycle rules key on object age and prefix only (never metadata), and
because R2's Bucket Lock stores one retain-until date per object — a 14-day daily and a 400-day
monthly cannot be the same object.

**GCS-archive's retention is bucket-level, not per-object** (`gcloud storage buckets update
--retention-period`) — one 400-day period for everything in the bucket. Daily-tier objects there
simply outlive their working-bucket copy by design; deliberate over-retention, cheap at this size.

**R2's lifecycle-delete age is set a few days longer than its Bucket Lock retain-until** (14d
lock / 21d delete for daily, 400d lock / 407d delete for monthly) — a lifecycle delete against a
still-locked object fails, so the gap avoids noisy failures at every tier boundary.

`permanent/` promotion is manual, always — a two-line `gcloud storage cp` (or R2 equivalent) of an
existing object into `permanent/` under its same filename, documented in
[`backup-infra-setup.md`](backup-infra-setup.md) rather than automated, for the rare thing worth
keeping forever.

**What retention actually guards against is late-discovered corruption**, not disk failure — if
historical data is mangled in one month and found several months later, the monthly tier is what
saves you. There is no known records-retention obligation on this data today; revisit the 400-day
figure if ICR ever confirms one.

## RPO / RTO

- **RPO ≤ 6h** — four scheduled runs/day (`17 1,7,13,19 * * *` UTC), matched to Neon free's confirmed
  6h PITR window, so no recovery gap anywhere exceeds 6h regardless of detection speed.
- Neon's own 6h PITR only covers same-session mistakes detected within 6h — a bad write found the
  next day is already outside it, and it covers nothing that dies with the Neon account (billing
  lapse, credential compromise). Treat it as a convenience, not a recovery tier.
- Google Calendar/Zoom hold a denormalized, unidirectional downstream copy of *meeting* data only (no
  schema/users/roles/settings) — useful for hand-reconstructing a lost few hours, nothing more; not a
  backup.
- **RTO ≈ 30 min**: decrypt → `pg_restore` into a fresh Neon branch → repoint `DATABASE_URL`.
  Restoring into a branch rather than over the primary is `restore-db.sh`'s default; the actual figure
  is only as reliable as the drills that have measured it (see below), and each real restore's
  measured duration should be recorded in its postmortem entry.

## The two-key rule

Every backup is encrypted with `age` to **two independent recipients**, not one — an availability
decision, not a secrecy one. `age -r KEY_A -r KEY_B` wraps the file's key once per recipient; either
private key alone decrypts (OR, not AND — a threshold split would need multiple people coordinating
*during* an incident, the wrong tradeoff here).

- **Key A** = held by the Maintenance Lead role, the project's persistent cross-semester contact.
- **Key B** = held outside the student rotation entirely — ICR staff, or a long-lived H4I org account
  — generated directly into that party's own vault.

This defends against the archive becoming permanently unreadable because one person is unreachable —
with a single key, that isn't a degraded state, it's total irreversible loss of the whole archive, in
an org with semesterly turnover. Verification tests both keys independently: a two-key design only
ever tested with key A is a one-key design nobody's noticed yet.

> [!WARNING]
> **`age` has no re-keying, and rotation is not retroactive.** An artifact encrypted to {A, B} opens
> to A or B forever — changing the recipient list only changes what *future* runs produce. Stored
> objects are immutable by design (create-only IAM, bucket retention, Bucket Lock), so nothing can be
> rewritten in place. The only thing that actually retires a key is retention expiry — up to 400 days
> (never, if the key was ever used for a `permanent/` object). **When the Maintenance Lead role
> changes hands, transfer key A — don't destroy it.** Destroying a departing holder's key silently
> drops every *historical* artifact from two-key redundancy back to one; adding a successor as a
> third recipient only protects new backups, the tail still needs A or B. `meta.json`'s
> `ageRecipients` field (public keys, non-secret) makes a compromise or rotation auditable — `age`
> itself doesn't reveal which recipients a file was encrypted to.

If a key is compromised: rotate the recipient set immediately (future runs stop including it) →
assume every artifact listing it in `meta.json` is disclosed, enumerate, don't estimate → re-encrypt
and purge what can be purged (R2's Bucket Lock and GCS-archive's retention policy mean those copies
can't be purged before their dates — plan around that) → escalate to ICR leadership on disclosure
obligations, since this is attendance data for a recovery center — that's the org's call, not an
engineering one → postmortem entry.

## The `age` private key stays out of CI

Full stop — including in an "environment secret" form. Technically supported (GitHub encrypted
secrets are unreadable after creation, masked in logs), but wrong here: a compromised repo/CI today
can only *write* new backups (create-only IAM, no key to decrypt). Put the key in CI and one leaked
token yields the full retention window of plaintext attendance data for a recovery center — the most
sensitive data this project holds, on a **public repo** with a rotating student team holding write
access.

The capability it would add (decrypting a stored artifact in CI) is already covered without it:
integrity by sha256 + GCS CRC32C, restorability by the in-run structural verification against the
scratch-container restore. Automated restore is a separate question with the same answer — restore is
a once-in-years action; automating it saves minutes and adds permanent risk. See the break-glass
runbook below.

## Cron-disable risk and its mitigation

GitHub disables `schedule` triggers on public repos after 60 days of repo inactivity — close to the
gap between student cohorts. What resets the timer isn't fully documented by GitHub (pushed commits,
working interpretation); whether bot commits (Dependabot, version bumps) count is undocumented — don't
rely on them as a designed control.

The mitigation that actually survives a quiet repo: **backup freshness surfaces on the app's own
Diagnostics card** — the tool people already open, not the Actions tab nobody checks. A GitHub Issue
on workflow failure is a secondary signal, and is itself a cron-dependent mechanism — it dies the same
way if the repo goes fully quiet. The Diagnostics card is the load-bearing control.

## Verification: restore drills

**A backup that's never been test-restored isn't a backup.** Every run's in-CI structural
verification (schema tables present, `Admin`/`Meeting` non-empty, no orphaned
`RecurrencePattern`/`SuspensionPeriod` rows, `pg_restore --list` parses with a non-zero TOC) proves the
dump is well-formed, but proves nothing about whether the two-key decrypt path, the restore script,
and a human's ability to run it under pressure actually work.

`frontend/scripts/restore-drill.sh` is the answer: run quarterly, non-destructive, downloads the
newest monthly backup, decrypts it, restores into a scratch database, and diffs row counts exactly
against the artifact's own `meta.json` `rowCounts`, printing a dated PASS/FAIL block. A drill that
never runs is a backup design that has never actually been proven to work — treat a missed quarter as
an open incident, not a scheduling footnote.

## Decryption requirements

What's required to decrypt an artifact, and nothing more: the encrypted file (from any of the three
targets) + one of the two private keys (as a file, either alone suffices) + the `age` binary. Then for
restore: `pg_restore` + a target database. No network, no key server, no GitHub, no Vercel, no Neon
API — the recovery path must not depend on any system that could itself be the thing that failed.

The `.meta.json` sidecar is unencrypted by design, so the admin UI can render the inventory without a
key. Aggregate row counts and hashes are fine in it; nothing else — no sample rows, emails, connection
strings.

## The break-glass restore runbook

"Break-glass" here isn't a policy choice — the `age` private key is offline, so no automated system
*can* restore. That property is what makes it safe to store this data in third-party clouds and what
stops a compromised admin session from destroying production. "Break-glass" means a procedure that
deliberately requires a human with out-of-band credentials, is conspicuous, rarely used, and leaves
evidence it was used.

This section is authoritative. The Backups admin tab's Restore Runbook card is a read-only mirror —
it renders prerequisites and a copy-to-clipboard command, executes nothing; its value is
discoverability.

**Preconditions:** an `age` private key (holder A or B) and Neon production project access.

0. **Declare, freeze, and hold.** Note the time, stop further writes if the cause is ongoing, decide
   the target recovery point before touching anything. Place a temporary hold on every candidate
   snapshot so the lifecycle sweep can't delete evidence mid-investigation; release holds at
   close-out.
1. **Pick a snapshot** — newest one strictly before the incident, check `Verified ✓`.
2. **Retrieve it** — signed URL from the Backups tab, or `gcloud storage cp`/`aws s3 cp`. Pull from a
   different target if one is implicated in the incident.
3. **Verify integrity** — sha256 against the sidecar before trusting it; a mismatch means fetch
   another copy, not "proceed carefully."
4. **Decrypt on a machine you control** — never shared, never a CI runner.
5. **Restore into a new Neon branch, never over production** — `frontend/scripts/restore-db.sh`'s
   default; it refuses a `-pooler` host, and overwriting the primary requires an explicit
   `--target-is-production` flag.
6. **Verify before cutting over** — row counts vs. the sidecar's `rowCounts`; spot-check a local
   instance against the branch.
7. **Cut over** — repoint `DATABASE_URL`, redeploy. First irreversible step; everything above is a
   dry run. Everything written to production between the snapshot and this moment is lost —
   enumerate that delta (GCal/Zoom hold a partial downstream copy) before cutting over, and consider a
   targeted repair instead of a full restore if the window is long and the corruption narrow.
8. **Close out** — shred the plaintext dump, rotate any implicated credential, dispatch the backup
   workflow manually for a clean baseline, write a postmortem entry including how long the restore
   actually took (the only honest source for the RTO this doc claims).

**Do not:**
- run `pg_restore --clean` against production as a first move
- decrypt on a shared/public machine
- paste key material anywhere that logs it
- leave the plaintext dump on disk
- skip step 6 because the outage feels urgent

## Related docs

- [`backup-infra-setup.md`](backup-infra-setup.md) — operator checklist for provisioning the GCP
  projects, R2 bucket, and `age` key ceremony.
- [`credentials-and-integrations.md`](credentials-and-integrations.md) — the full set of secrets,
  variables, and key-custody locations.
- [`technical-decisions.md`](technical-decisions.md) — the 3-2-1-1-0 design record and its revisit
  triggers.

## Open items (owned, not blocking)

- **Billing stopgap.** Both GCP projects are currently billing-linked to the test Gmail account's
  billing account as an availability-only dependency (billing admins can't read bucket data; a billing
  unlink stops new writes but existing objects and retention survive). Follow-up: restore the primary
  dev account's own billing account and re-link both projects, then remove the stopgap grant. Tracked
  in `backup-infra-setup.md`.
- **`age` key ceremony not yet run.** `AGE_PUBLIC_KEY_A`/`AGE_PUBLIC_KEY_B` GitHub variables are still
  unset pending the two-person key-generation ceremony — see `backup-infra-setup.md`. Until both
  variables are set, the backup workflow cannot encrypt successfully.
- **Cloudflare R2 usage notification** — a low-threshold billing/usage alert is planned as the
  mitigation for R2 having no hard spend cap on Cloudflare; not yet configured. Tracked in
  `backup-infra-setup.md`.
- **Who holds `age` private key B** is a role, not yet a named individual/account — must be confirmed
  with ICR before the key ceremony runs.

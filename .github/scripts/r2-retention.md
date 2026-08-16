# R2-archive Object Lock + lifecycle policy

Applies to Cloudflare R2 bucket `icr-db-backup-r2` — the third of three independent storage
targets, and the genuinely separate vendor in the 3-2-1-1-0 design.

## Object Lock

Object Lock is enabled via R2's Bucket Lock feature (available on the free tier), in
**Governance** mode (not Compliance): the write-only CI token can never bypass a
lock, but the account owner retains a documented, logged emergency override for its own mistakes —
the more realistic failure mode for a volunteer team than a malicious actor.

**Object Lock must be enabled at bucket creation — it cannot be turned on for an existing
bucket.** `icr-db-backup-r2` has it enabled.

Retention is enforced entirely by the bucket's **prefix-scoped Bucket Lock rules** — R2 does not
implement the S3 per-object `x-amz-object-lock-*` PutObject parameters, so `upload-backup.sh`
uploads plain objects and the bucket rules below apply the lock automatically by prefix.

### Per-tier lock durations

| Prefix | Retain (Object Lock) | Lifecycle delete | Gap |
|---|---|---|---|
| `daily/` | 14 days | 21 days | 7 days |
| `monthly/` | 400 days | 407 days | 7 days |
| `permanent/` | **no lock rule** | **no lifecycle rule** | — |

## Why lifecycle-delete is set *past* the lock date, never equal to it

A lifecycle delete attempt against an object still inside its Object Lock retention window fails.
Setting the delete age exactly equal to the retain-until age guarantees that failure at every
single tier boundary, since R2 evaluates lifecycle roughly daily rather than to the second. The
7-day gap (14d retain / 21d delete for `daily/`; 400d retain / 407d delete for `monthly/`) exists
purely to keep lifecycle deletion firing cleanly after the lock has already lapsed — it is not an
additional retention guarantee, just a scheduling buffer. This mirrors the equivalent decision on
`gs://icr-db-backups-archive` (bucket-level retention 400d, lifecycle delete 407d — see
`gcs-archive-retention.md`).

## `permanent/` — deliberately unlocked and unpruned

`permanent/` gets neither an Object Lock rule nor a lifecycle rule. An indefinite Object Lock
would behave like Compliance mode in practice — unfixable if an object is ever promoted into
`permanent/` by mistake, since nothing (not even the account owner) could shorten or remove an
indefinite lock. Instead, `permanent/` is protected by two things that are both reversible by a
human but not by the write-only CI credential: create-only R2 API tokens (no delete permission at
all), and the simple absence of any delete-triggering lifecycle rule for that prefix. Promotion
into `permanent/` is always a manual, hand-run copy — there is no automated path that could ever
populate this prefix incorrectly at scale.

## Steady state

At ~8 MB per artifact, 56 dailies + 13 monthlies ≈ 550 MB against R2's 10 GB free-tier allowance —
about 18x headroom. R2 has no hard spend cap; overage risk is treated as an alert-plus-bounded-
blast-radius problem (Cloudflare usage notification at a low threshold, write-only single-bucket-
scoped tokens, zero egress cost) rather than a cap.

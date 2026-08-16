# GCS-archive bucket-level retention

Applies to `gs://icr-db-backups-archive` only (the new, second GCP project — pure redundancy
+ immutability copy). `gs://icr-db-backups-prod` (the working bucket) carries no bucket-level
retention; its immutability comes from create-only IAM instead — see
`gcs-lifecycle.json`'s sibling note below.

## Applied command (live since 2026-08-16)

```sh
gcloud storage buckets update gs://icr-db-backups-archive \
  --retention-period=34560000s
```

34560000 seconds = 400 days exactly. **Use the seconds form, not `--retention-period=400d`** —
`gcloud` parses the `d` suffix as 86400s but rounds through a value that lands at ~399.25 days,
not 400; seconds are the only unambiguous unit here.

Policy is deliberately **UNLOCKED** (not `--lock`). Locking a GCS bucket retention policy is
irreversible — it can never be shortened or removed, even by the project owner, even to fix a
misconfiguration. Unlocked still blocks every deletion/overwrite attempt (including by the
create-only CI service account) until the retention period elapses; it only stops protecting
against a project owner who deliberately reduces or removes the policy. That's the intended
threshold here: immutable against CI compromise and casual mistakes, not against the org's own
GCP admin — consistent with R2's Object Lock running in Governance (not Compliance) mode for the
same reason.

## Why bucket-level, not per-object

GCS bucket retention policies apply one period to the entire bucket — there is no per-object or
per-prefix retention primitive in GCS (unlike R2's Object Lock, which stamps a retain-until date
on each object at upload time). The bucket holds both `daily/` and `monthly/` tiers, so the
period is set to the *longer* tier (400 days). This deliberately over-retains daily-tier objects
here by up to ~386 days relative to their working-bucket copy (which expires dailies at 21 days) —
cheap at this data size (~550 MB steady state) and explicitly accepted in the backup feature plan's
GFS section rather than treated as a bug.

## Lifecycle (deletion) on this bucket

This bucket's lifecycle deletes **both** prefixes at 407 days (`daily/` and `monthly/` alike) —
not the 21d/407d split used on the working bucket. Retention (400d) and lifecycle-delete (407d)
are intentionally offset by 7 days: a lifecycle delete attempt against an object still inside its
bucket-level retention window fails, so deletion must always be scheduled to land after retention
expires, never at the same age.

## `permanent/` — no lifecycle rule, on either GCS bucket

Neither `gcs-lifecycle.json` (working bucket) nor this bucket's lifecycle config has a rule
matching the `permanent/` prefix. This is deliberate, not an oversight: `permanent/` objects are
meant to live forever, promoted by hand (a one-off `gcloud storage cp` into `permanent/`, never
automated — see the backup feature plan's GFS section). A lifecycle rule matching `permanent/`
would risk an eventual accidental deletion of the one tier meant to never expire; the absence of
any rule for that prefix is itself the safeguard. `gcs-lifecycle.json` is valid, comment-free JSON
(as required by `gcloud storage buckets update --lifecycle-file`) precisely because this omission
is documented here rather than inline.

## Also active on both GCS buckets: default soft-delete

GCS's default 7-day soft-delete policy is active on both `icr-db-backups-prod` and
`icr-db-backups-archive` (confirmed live 2026-08-16) — a bonus safety net on top of the
retention/lifecycle design above, not something either bucket's config had to opt into. It does
not change the retention math above; it just gives a 7-day undo window on top of it for anything
lifecycle deletes.

# Backup Infra Setup

Operator checklist for the three storage targets behind the backup workflow (see
[Backups and Recovery](backups-and-recovery.md) for the design, [Credentials and
Integrations](credentials-and-integrations.md) for the resulting secret/variable inventory). This
doc is both:

- a **reproducible from-zero checklist** — every command needed to rebuild this infra if it's ever
  lost or re-provisioned into new accounts, and
- an **as-built record** of what actually exists today (provisioned 2026-08-16), including the
  deviations and gotchas hit while building it.

Run gcloud blocks 1 and 2 while authenticated as the production Google account
(`…@518icr.com`); block 3 in the Cloudflare dashboard for the ICR/H4I-controlled account.

---

## 1. Production project — `icr-management-system`

Existing project (project number `152224493895`), already used for the app's Google Calendar
OAuth. This block only adds the backup-workflow pieces.

### 1.1 Enable required APIs

```sh
gcloud config set project icr-management-system

gcloud services enable \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com
```

### 1.2 Create the working bucket

```sh
gcloud storage buckets create gs://icr-db-backups-prod \
  --location=us-east1 \
  --uniform-bucket-level-access \
  --public-access-prevention=enforced
```

`us-east1` is one of the three regions covered by GCS's Always Free 5 GB-month allowance
(`us-east1`/`us-west1`/`us-central1` — see the backup feature plan's budget table). Uniform
bucket-level access + enforced public access prevention are both required for a bucket holding
attendance data.

### 1.3 Apply lifecycle rules

```sh
gcloud storage buckets update gs://icr-db-backups-prod \
  --lifecycle-file=.github/scripts/gcs-lifecycle.json
```

`gcs-lifecycle.json` deletes `daily/` at 21 days and `monthly/` at 407 days (`permanent/`
deliberately has no rule — see that file's comment). This bucket carries **no bucket-level
retention policy** — its immutability comes from the CI service account's create-only IAM instead
(§1.4), unlike the archive bucket in block 2.

### 1.4 Create the service account, scoped to this bucket only

```sh
gcloud iam service-accounts create icr-db-backup \
  --display-name="Backup workflow — production bucket writer"

gcloud storage buckets add-iam-policy-binding gs://icr-db-backups-prod \
  --member="serviceAccount:icr-db-backup@icr-management-system.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

**No project-level role is granted.** `objectCreator` on the bucket is the entire grant — no
delete, no overwrite, no read of other buckets in the project.

### 1.5 Workload Identity Federation (no downloaded service-account key)

```sh
gcloud iam workload-identity-pools create github-actions \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github-actions \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='cornellh4i/ithaca-recovery'"
```

⚠️ **The `attribute-condition` is load-bearing security, not boilerplate.** Without it, *any*
GitHub Actions workflow in *any* repository could mint a token that this WIF provider accepts and
trades for `icr-db-backup`'s credentials — the pool's trust isn't otherwise scoped to this repo at
all. Never omit it or widen it.

```sh
gcloud iam service-accounts add-iam-policy-binding \
  icr-db-backup@icr-management-system.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/152224493895/locations/global/workloadIdentityPools/github-actions/attribute.repository/cornellh4i/ithaca-recovery"
```

This is the "double-binding" the plan refers to: the WIF provider (above) establishes *who* GitHub
can prove itself as; this binding is the separate grant that lets that identity actually
impersonate `icr-db-backup`. Both are required — either alone denies auth.

Record the provider's full resource name for the `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub variable:

```
projects/152224493895/locations/global/workloadIdentityPools/github-actions/providers/github
```

---

## 2. Archive project — `icr-backups-archive`

A **new** GCP project, same production Google account (`…@518icr.com`) as block 1 — deliberately
not the shared dev/test account, which has standing test-user access for other student
contributors. Its whole purpose is being a second, independent failure domain (separate
billing/IAM/project) from the production project.

```sh
gcloud projects create icr-backups-archive \
  --name="ICR Backups Archive"
```

Project number: `236481171441`.

⚠️ **A brand-new project's IAM propagation can lag ~1 minute.** `workload-identity-pools create`
against a project created seconds earlier can fail with `PERMISSION_DENIED` even though the
command and credentials are correct. Retry after ~60s rather than debugging permissions — this is
what happened during the 2026-08-16 provisioning.

### 2.1 Billing — see the open item below before doing this on a fresh project

Confirm billing is linked before enabling APIs (billed services fail to enable on an unlinked
project):

```sh
gcloud billing projects link icr-backups-archive \
  --billing-account=<BILLING_ACCOUNT_ID>
```

⚠️ **As-built deviation — see "Billing stopgap" below.** As of 2026-08-16 this project (and the
production project) is linked to `017207-9146F6-F17BB6`, owned by the shared test account, not
dev@518icr.com's own account.

### 2.2 Enable APIs, create bucket, SA, WIF — same steps as block 1

```sh
gcloud config set project icr-backups-archive

gcloud services enable \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com

gcloud storage buckets create gs://icr-db-backups-archive \
  --location=us-east1 \
  --uniform-bucket-level-access \
  --public-access-prevention=enforced
```

### 2.3 Bucket-level retention (the one step that differs from block 1)

```sh
gcloud storage buckets update gs://icr-db-backups-archive \
  --retention-period=34560000s
```

⚠️ **Use the seconds form, not `--retention-period=400d`.** `gcloud` parses the `d` suffix as
86400s but the rounding lands at ~399.25 days, not exactly 400 — seconds are the only unambiguous
unit. `34560000s` = 400 days exactly. Full rationale (including why this is deliberately
**unlocked**, not `--lock`) is in `.github/scripts/gcs-archive-retention.md`.

```sh
gcloud storage buckets update gs://icr-db-backups-archive \
  --lifecycle-file=.github/scripts/gcs-lifecycle.json
```

Note: this archive bucket's actual applied lifecycle deletes **both** prefixes at 407 days
(unlike the working bucket's 21d/407d split) — see `gcs-archive-retention.md` for why. If
re-provisioning from scratch, either apply a second lifecycle file with the 407/407 rule, or edit
`gcs-lifecycle.json`'s ages before applying to this bucket.

### 2.4 Separate service account and fully independent WIF

```sh
gcloud iam service-accounts create icr-db-backup-archive \
  --display-name="Backup workflow — archive bucket writer"

gcloud storage buckets add-iam-policy-binding gs://icr-db-backups-archive \
  --member="serviceAccount:icr-db-backup-archive@icr-backups-archive.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"

gcloud iam workload-identity-pools create github-actions \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github-actions \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='cornellh4i/ithaca-recovery'"

gcloud iam service-accounts add-iam-policy-binding \
  icr-db-backup-archive@icr-backups-archive.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/236481171441/locations/global/workloadIdentityPools/github-actions/attribute.repository/cornellh4i/ithaca-recovery"
```

**WIF trust is per-project, not shared.** This pool/provider/binding is entirely independent of
block 1's — the same pool *name* (`github-actions`) exists in both projects, but they are
unrelated resources with no cross-project trust between them. Compromising one project's WIF
config does not grant access to the other.

Record for `GCP_ARCHIVE_WORKLOAD_IDENTITY_PROVIDER`:

```
projects/236481171441/locations/global/workloadIdentityPools/github-actions/providers/github
```

---

## 3. Cloudflare R2 — `icr-db-backup-r2`

Done in the Cloudflare dashboard (R2 has no `gcloud`-equivalent CLI step here; `wrangler` could
substitute but wasn't used for the 2026-08-16 provisioning).

1. **Create the bucket with Object Lock enabled at creation.** ⚠️ Object Lock **cannot** be turned
   on for an existing bucket — if this step is missed, the only fix is deleting and recreating the
   bucket under a new name. Bucket name: `icr-db-backup-r2`.
2. **Set Bucket Lock default retention: Governance mode.** Not Compliance — see
   `.github/scripts/r2-retention.md` for why (the account owner needs an emergency override for
   its own mistakes; the write-only CI token can't bypass either mode).
3. **Add prefix-scoped lock rules** (per `r2-retention.md`):
   - `daily/` — retain 14 days
   - `monthly/` — retain 400 days
   - `permanent/` — **no lock rule** (deliberate — see that doc)
4. **Set lifecycle (delete) rules**, offset past the lock durations so a delete never races a still
   -locked object:
   - `daily/` — delete at 21 days
   - `monthly/` — delete at 407 days
   - `permanent/` — no lifecycle rule
5. **Create an Account-level API token** (Dashboard → R2 → Manage API Tokens), not a User token:
   - Permission: **Object Read & Write**
   - Scope: this one bucket only (`icr-db-backup-r2`)
   - TTL: forever (rotate only on suspected compromise, per
     `credentials-and-integrations.md`)
   - **No IP filter** — GitHub-hosted runners have no stable IP range to allow-list.
6. **Note the S3-compatible endpoint URL**:
   ```
   https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
   ```
   `<R2_ACCOUNT_ID>` is the Cloudflare account ID shown in the dashboard sidebar, not the bucket
   name.

Resulting values map to the `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` GitHub
Actions secrets and the `R2_BUCKET` variable (see `credentials-and-integrations.md`).

**Cloudflare usage notification — configured (2026-08-16):** a usage-based billing notification
at a low threshold, set in Dashboard → Notifications on the account owning the R2 bucket. R2 has
no hard spend cap; this notification is the early-warning signal for a compromised token spamming
writes (egress is free, so it isn't a cost vector). If it ever needs re-creating: account-level
Notifications → Add → Billing → the usage-based type, threshold well under the 10 GB / 1M-ops
free tier, destination an org-monitored inbox.

---

## 4. GitHub repository setup

### 4.1 Secrets and variables

Set per the full table in [Credentials and Integrations](credentials-and-integrations.md). Quick
reference of what's a secret vs. a variable:

- **Secrets:** `DATABASE_URL_UNPOOLED`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- **Variables:** `R2_ACCOUNT_ID`, `R2_BUCKET`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `GCP_SERVICE_ACCOUNT`, `GCS_WORKING_BUCKET`, `GCP_ARCHIVE_WORKLOAD_IDENTITY_PROVIDER`,
  `GCP_ARCHIVE_SERVICE_ACCOUNT`, `GCS_ARCHIVE_BUCKET` (8 variables — WIF federates trust, so none
  of these are secret-worthy on their own)
- **Variables, pending the key ceremony (§5):** `AGE_PUBLIC_KEY_A`, `AGE_PUBLIC_KEY_B`

`DATABASE_URL_UNPOOLED` is sourced fresh from the Neon dashboard with pooling toggled off — not
derived from the app's own `DATABASE_URL` secret, which is the pooled variant.

### 4.2 Create the `backup-failure` issue label

The workflow's `if: failure()` step opens a GitHub Issue labeled `backup-failure`; `gh issue
create --label` errors on an unknown label, so this must exist before the workflow's failure path
can ever fire cleanly:

```sh
gh label create backup-failure \
  --color B60205 \
  --description "Automated backup workflow run failed" \
  --repo cornellh4i/ithaca-recovery
```

---

## 5. `age` key ceremony

Two independent key pairs, generated on two different people's machines — never both on one
machine, which would defeat the point of the OR-not-AND design (see the backup feature plan's
"Two `age` recipients" section).

1. **Key A — the Maintenance Lead's machine:**
   ```sh
   age-keygen -o key-a.txt
   ```
   Output has both the public key (`# public key: age1…`) and the private key on one line.
2. **Key B — an org-owned vault outside the student rotation** (ICR staff-side or a long-lived H4I
   account — holder still an open decision as of 2026-08-16; see the plan's open questions):
   ```sh
   age-keygen -o key-b.txt
   ```
3. **Publish the public keys** as the `AGE_PUBLIC_KEY_A` / `AGE_PUBLIC_KEY_B` GitHub Actions
   variables (the line starting `# public key:` in each file, or re-derive with
   `age-keygen -y key-a.txt`).
4. **Move each private key into its holder's password manager** — never a synced notes app, repo,
   or chat message. Key A → Maintenance Lead's entry. Key B → the org vault.
5. **Shred the plaintext files** once both keys are safely in a password manager:
   ```sh
   shred -u key-a.txt key-b.txt
   ```
6. **Test-decrypt with each key independently** before trusting either — encrypt a throwaway file
   to both recipients, then confirm key A alone decrypts it, and separately that key B alone
   decrypts it:
   ```sh
   echo "test" | age -r <AGE_PUBLIC_KEY_A> -r <AGE_PUBLIC_KEY_B> -o test.age
   age -d -i key-a.txt test.age   # must succeed using only key A
   age -d -i key-b.txt test.age   # must succeed using only key B
   ```
   A two-key design only ever tested with key A is a one-key design nobody's noticed yet.

**Status as of 2026-08-16: not yet performed.** `AGE_PUBLIC_KEY_A`/`_B` are unset; the backup
workflow cannot run end-to-end until this ceremony completes.

---

## 6. Manual `permanent/` promotion

Documented here, deliberately not scripted — a rare, by-hand action for the handful of artifacts
ever worth keeping forever (a pre-migration snapshot, a final pre-handoff state). Copies an
existing object into the `permanent/` prefix under its same filename; `permanent/` has no
lifecycle rule and no Object Lock rule on any of the three targets, so once promoted an object is
never auto-deleted.

**GCS (working or archive bucket):**

```sh
gcloud storage cp \
  gs://icr-db-backups-prod/monthly/20260801T071700Z.age \
  gs://icr-db-backups-prod/permanent/20260801T071700Z.age

gcloud storage cp \
  gs://icr-db-backups-prod/monthly/20260801T071700Z.age.sha256 \
  gs://icr-db-backups-prod/permanent/20260801T071700Z.age.sha256

gcloud storage cp \
  gs://icr-db-backups-prod/monthly/20260801T071700Z.meta.json \
  gs://icr-db-backups-prod/permanent/20260801T071700Z.meta.json
```

**R2:**

```sh
aws s3 cp \
  s3://icr-db-backup-r2/monthly/20260801T071700Z.age \
  s3://icr-db-backup-r2/permanent/20260801T071700Z.age \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

(repeat for the `.sha256` and `.meta.json` sidecars). No `--object-lock-mode` flag — `permanent/`
is intentionally never locked (see `r2-retention.md`).

---

## 7. Operator-machine prerequisites

Tools needed on whatever machine runs `restore-db.sh` or `restore-drill.sh` (never a CI runner —
see the break-glass runbook in `backups-and-recovery.md`):

- [`age`](https://github.com/FiloSottile/age) — decrypt
- `postgresql-client` (provides `pg_restore`) — matching or newer major version than the source
  Postgres (17)
- `gcloud` (Google Cloud CLI) — fetch from GCS
- `jq` — parse `meta.json` sidecars

---

## As-built status (2026-08-16)

Everything above was provisioned and verified live on 2026-08-16, with these open items:

### Billing stopgap — open

Both `icr-management-system` and `icr-backups-archive` are billing-linked to
`017207-9146F6-F17BB6`, owned by the shared test Google account
(`ithacacommunityrecoverytest@gmail.com`), via a `roles/billing.user` grant to `dev@518icr.com` on
that billing account. This is a stopgap: dev@518icr.com's own billing account
(`0134D0-99F9C6-BF6F48`) is currently **closed** (card declined 2026-08-16).

Accepted as an **availability-only** risk — billing admins on the test account cannot read bucket
data, and a billing unlink stops new writes but does not delete existing objects or waive their
retention policies.

**Follow-up, once the card issue is resolved:**

```sh
# after dev@518icr.com's billing account is reopened
gcloud billing projects link icr-management-system \
  --billing-account=0134D0-99F9C6-BF6F48
gcloud billing projects link icr-backups-archive \
  --billing-account=0134D0-99F9C6-BF6F48
```

Then remove `dev@518icr.com`'s `roles/billing.user` grant on the test account's billing account
(`017207-9146F6-F17BB6`) — that grant should not outlive the stopgap.

### `age` key ceremony — open

Not yet performed. See §5. Blocks the workflow from running end-to-end (backups can be dumped,
verified, and dumped to a scratch container, but the encryption step has no recipients configured
until `AGE_PUBLIC_KEY_A`/`_B` exist).

### Cloudflare usage notification — done (2026-08-16)

Configured; see §3, last paragraph.

### Confirmed working / no action needed

- Both GCS buckets exist with the exact flags in §1.2/§2.2, lifecycle rules applied and matching
  `gcs-lifecycle.json` (working) / the 407d-both-prefixes variant (archive).
- Both service accounts hold `objectCreator` on their own bucket only — verified no project-level
  roles are attached.
- Both WIF pools/providers are repo-conditioned (`attribute-condition` present) and bound.
- GCS's default 7-day soft-delete is active on both buckets — a bonus safety net neither bucket had
  to opt into; doesn't change the retention/lifecycle math above.
- All GitHub secrets and variables from §4.1 are set, `R2_BUCKET=icr-db-backup-r2`, except the two
  pending `AGE_PUBLIC_KEY_*` variables noted above.

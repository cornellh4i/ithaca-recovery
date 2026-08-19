# Backup Infra Setup

Reproducible from-zero checklist for the backup pipeline's cloud resources — every command needed
to rebuild this infra if it's ever lost or re-provisioned into new accounts. See
[Backups and Recovery](../02-handoff/backups-and-recovery.md) for the design and [Credentials and
Integrations](../02-handoff/credentials-and-integrations.md) for the resulting secret/variable
inventory.

Run gcloud blocks 1 and 2 while authenticated as the production Google account
(`dev@518icr.com`, which owns both backup GCP projects); block 3 in the Cloudflare dashboard for
the production Cloudflare account (also owned by `dev@518icr.com`).

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
(`us-east1`/`us-west1`/`us-central1`). Uniform bucket-level access + enforced public access
prevention are both required for a bucket holding attendance data.

### 1.3 Apply lifecycle rules

```sh
gcloud storage buckets update gs://icr-db-backups-prod \
  --lifecycle-file=.github/scripts/gcs-lifecycle.json
```

`gcs-lifecycle.json` deletes `daily/` at 21 days and `monthly/` at 407 days (`permanent/`
deliberately has no rule — the JSON must stay comment-free, so the omission is documented in §2.3). This bucket carries **no bucket-level
retention policy** — its immutability comes from the CI service account's create-only IAM instead
(§1.4), unlike the archive bucket in block 2.

GCS's default 7-day soft-delete is active on this bucket as a bonus safety net; it doesn't change
the retention/lifecycle math above.

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

This "double-binding" is required: the WIF provider (above) establishes *who* GitHub can prove
itself as; this binding is the separate grant that lets that identity actually impersonate
`icr-db-backup`. Both are required — either alone denies auth.

The provider's full resource name, for the `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub variable:

```
projects/152224493895/locations/global/workloadIdentityPools/github-actions/providers/github
```

---

## 2. Archive project — `icr-backups-archive`

A separate GCP project (project number `236481171441`), same production Google account
(`dev@518icr.com`) as block 1 — deliberately not the shared dev/test account, which has standing
test-user access for other student contributors. Its whole purpose is being a second, independent
failure domain (separate billing/IAM/project) from the production project.

```sh
gcloud projects create icr-backups-archive \
  --name="ICR Backups Archive"
```

⚠️ **A brand-new project's IAM propagation can lag ~1 minute.** `workload-identity-pools create`
against a project created seconds earlier can fail with `PERMISSION_DENIED` even though the
command and credentials are correct. Retry after ~60s rather than debugging permissions.

### 2.1 Billing

Confirm billing is linked before enabling APIs (billed services fail to enable on an unlinked
project):

```sh
gcloud billing projects link icr-backups-archive \
  --billing-account=<BILLING_ACCOUNT_ID>
```

Replace before running:

- `<BILLING_ACCOUNT_ID>` — ICR's own billing account, `014C6E-AF3705-52AF26`: owned
  (`roles/billing.admin`) by Matt Kaskela, ICR President (`matt.kaskela@518icr.com`), with a
  `roles/billing.user` grant to `dev@518icr.com` for linking projects to it. Both
  `icr-management-system` and `icr-backups-archive` link to it.

⚠️ **Unlinking billing disables the project's billed APIs, and re-linking does not re-enable
them** — after any billing change, re-check `gcloud services list --enabled` on the affected
project (the 2026-08-19 billing switch silently disabled the production project's Calendar API).

### 2.2 Enable APIs, create bucket — same steps as block 1

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

GCS's default 7-day soft-delete is active on this bucket too, alongside the retention policy
below.

### 2.3 Bucket-level retention (the one step that differs from block 1)

```sh
gcloud storage buckets update gs://icr-db-backups-archive \
  --retention-period=34560000s
```

⚠️ **Use the seconds form, not `--retention-period=400d`.** `gcloud` parses the `d` suffix as
86400s but the rounding lands at ~399.25 days, not exactly 400 — seconds are the only unambiguous
unit. `34560000s` = 400 days exactly. This period is deliberately **unlocked**, not `--lock`ed:
locking a GCS retention policy is irreversible — it can never be shortened or removed, even by
the project owner, even to fix a misconfiguration. Unlocked still blocks every delete/overwrite
(including by the create-only CI service account) until the period elapses; it only stops
protecting against a project owner who deliberately edits the policy — the intended threshold,
consistent with R2 running Governance rather than Compliance mode.

```sh
cat > /tmp/gcs-archive-lifecycle.json <<'JSON'
{
  "rule": [
    { "action": { "type": "Delete" }, "condition": { "age": 407, "matchesPrefix": ["daily/"] } },
    { "action": { "type": "Delete" }, "condition": { "age": 407, "matchesPrefix": ["monthly/"] } }
  ]
}
JSON
gcloud storage buckets update gs://icr-db-backups-archive \
  --lifecycle-file=/tmp/gcs-archive-lifecycle.json
```

Not `.github/scripts/gcs-lifecycle.json` — that file's 21-day `daily/` rule is the *working*
bucket's; this bucket deletes both prefixes at 407 days.

Both prefixes delete at 407 days here (unlike the working bucket's 21d/407d split): GCS
retention is bucket-level only — no per-prefix primitive — so the period is set to the longer
tier, deliberately over-retaining archived dailies (cheap by design). The 400d-retain /
407d-delete offset exists because a lifecycle delete against a still-retained object fails —
deletion must land after retention lapses, never at the same age.

Neither bucket's lifecycle has a rule matching `permanent/` — deliberate, not an oversight: the
absence of any delete-triggering rule is itself the safeguard for the never-expires tier
(`gcs-lifecycle.json` must stay comment-free JSON, so this omission is documented here). GCS's
default 7-day soft-delete is also active on both buckets — a bonus undo window on top of the
retention math, not something the config opts into.

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

For `GCP_ARCHIVE_WORKLOAD_IDENTITY_PROVIDER`:

```
projects/236481171441/locations/global/workloadIdentityPools/github-actions/providers/github
```

---

## 3. Cloudflare R2 — `icr-db-backup-r2`

Done in the Cloudflare dashboard (R2 has no `gcloud`-equivalent CLI step here; `wrangler` can
substitute).

1. **Create the bucket with Object Lock enabled at creation.** ⚠️ Object Lock **cannot** be turned
   on for an existing bucket — if this step is missed, the only fix is deleting and recreating the
   bucket under a new name. Bucket name: `icr-db-backup-r2`.
2. **Set Bucket Lock default retention: Governance mode.** Not Compliance: the write-only CI
   token can't bypass either mode, but Governance keeps a logged emergency override for the
   account owner's own mistakes — the realistic failure mode for a volunteer team. Bucket Lock is
   available on the free tier; R2 doesn't implement the S3 per-object `x-amz-object-lock-*`
   parameters, so uploads are plain objects and these bucket rules apply the lock by prefix.
3. **Add prefix-scoped lock rules**:
   - `daily/` — retain 14 days
   - `monthly/` — retain 400 days
   - `permanent/` — **no lock rule**: an indefinite lock behaves like Compliance in practice —
     a mistaken promotion into `permanent/` could never be fixed by anyone. Accepted residual
     risk: the workflow's Object Read & Write token *can* overwrite or delete unlocked
     `permanent/` objects — the prefix's protection is the absence of any lifecycle rule, the
     manual-only promotion path, and the retention-protected copies in both GCS buckets.
4. **Set lifecycle (delete) rules**, offset 7 days past the lock durations — R2 evaluates
   lifecycle roughly daily, so a delete scheduled at exactly the retain-until age fails against
   the still-locked object; the gap is a scheduling buffer, not extra retention:
   - `daily/` — delete at 21 days
   - `monthly/` — delete at 407 days
   - `permanent/` — no lifecycle rule
5. **Create an Account-level API token** (Dashboard → R2 → Manage API Tokens), not a User token:
   - Permission: **Object Read & Write**
   - Scope: this one bucket only (`icr-db-backup-r2`)
   - TTL: forever (rotate only on suspected compromise, per `credentials-and-integrations.md`)
   - **No IP filter** — GitHub-hosted runners have no stable IP range to allow-list.
6. **Note the S3-compatible endpoint URL**:
   ```
   https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
   ```
   `<R2_ACCOUNT_ID>` is the Cloudflare account ID shown in the dashboard sidebar, not the bucket
   name.

Resulting values map to the `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` GitHub
Actions secrets and the `R2_BUCKET` variable (see `credentials-and-integrations.md`).

**Cloudflare billing:** the account stays on the free plan, but R2 requires a payment method on
file — that's ICR's own card, the same one behind the GCP billing account (§2.1).

**Cloudflare usage notification:** a usage-based billing notification at a low threshold, set in
Dashboard → Notifications on the account owning the R2 bucket. R2 has no hard spend cap; this
notification is the early-warning signal for a compromised token spamming writes (egress is free,
so it isn't a cost vector). Steady state is ~0.8 GB (84 dailies — 4/day x 21 days — plus 13 monthlies, at ~8 MB each)
against the 10 GB free tier — ~12x headroom. To re-create: account-level Notifications → Add → Billing → the
usage-based type, threshold well under the 10 GB / 1M-ops free tier, destination an
org-monitored inbox.

---

## 4. GitHub repository setup

### 4.1 Secrets and variables

Set per the full table in [Credentials and Integrations](../02-handoff/credentials-and-integrations.md). Quick
reference of what's a secret vs. a variable:

- **Secrets:** `DATABASE_URL_UNPOOLED`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY` — the workflow reads `R2_ACCOUNT_ID` from `secrets.`, so it must live
  here, not in variables
- **Variables:** `R2_BUCKET`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `GCP_SERVICE_ACCOUNT`, `GCS_WORKING_BUCKET`, `GCP_ARCHIVE_WORKLOAD_IDENTITY_PROVIDER`,
  `GCP_ARCHIVE_SERVICE_ACCOUNT`, `GCS_ARCHIVE_BUCKET`, `AGE_PUBLIC_KEY_A`, `AGE_PUBLIC_KEY_B` (9
  variables — WIF federates trust and `age` public keys can only encrypt, so none of these are
  secret-worthy on their own)

`DATABASE_URL_UNPOOLED` is sourced fresh from the Neon dashboard with pooling toggled off — not
derived from the app's own `DATABASE_URL` secret, which is the pooled variant.

### 4.2 The `backup-failure` issue label

The workflow's `if: failure()` step opens a GitHub Issue labeled `backup-failure`; `gh issue
create --label` errors on an unknown label. The label is declared in
[`.github/labels.yml`](https://github.com/cornellh4i/ithaca-recovery/blob/master/.github/labels.yml)
and created automatically by `sync-labels.yml` — no manual step. If it's ever missing, re-run
the sync: `gh workflow run sync-labels.yml`.

---

## 5. `age` key ceremony

Two independent key pairs, generated on two different people's machines — never both on one
machine, which would defeat the point of the OR-not-AND design (see
[Backups and Recovery](../02-handoff/backups-and-recovery.md#the-two-key-rule)).

1. **Key A — the Maintenance Lead's machine:**
   ```sh
   age-keygen -o key-a.txt
   ```
   Output has both the public key (`# public key: age1…`) and the private key on one line.
2. **Key B — held by ICR: Matt Kaskela, President (Matt.Kaskela@518icr.com)**, outside the
   semesterly student rotation:
   ```sh
   age-keygen -o key-b.txt
   ```
3. **Publish the public keys** as the `AGE_PUBLIC_KEY_A` / `AGE_PUBLIC_KEY_B` GitHub Actions
   variables (the line starting `# public key:` in each file, or re-derive with
   `age-keygen -y key-a.txt`).
4. **Move each private key into its holder's password manager** — never a synced notes app, repo,
   or chat message. Key A → the Maintenance Lead's entry. Key B → Matt Kaskela's.
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

`AGE_PUBLIC_KEY_A`/`_B` are set as repo variables. Private key A is held by the H4I Maintenance
Lead (Nathnael Tesfaw, nbt26@cornell.edu); private key B by Matt Kaskela, ICR President
(Matt.Kaskela@518icr.com).

---

### Key rotation and compromise

Rotation is **not retroactive**: swapping an `AGE_PUBLIC_KEY_A`/`_B` repo variable only affects
future backups — every existing artifact stays encrypted to the keys it was written with, so the
outgoing private key must be kept until the last artifact encrypted to it ages out (~13 months
for `monthly/`, forever for `permanent/`). On a suspected private-key leak: generate a new pair
(`age-keygen`), update the matching repo variable, and keep in mind a leaked key alone reads
nothing — the attacker also needs an artifact, which requires bucket access.

## 6. Manual `permanent/` promotion

Deliberately not scripted — a rare, by-hand action for the handful of artifacts ever worth
keeping forever (a pre-migration snapshot, a final pre-handoff state). Copies an object into the
`permanent/` prefix under its same filename; no target has a lifecycle or Object Lock rule on
`permanent/`, so promoted objects are never auto-deleted.

Replace before running:

- `<STAMP>` — the artifact's timestamp, e.g. `20260801T071700Z` (from the Backups tab or a
  bucket listing)
- `<R2_ACCOUNT_ID>` — the Cloudflare account ID (§3)

**GCS (working or archive bucket):**

```sh
for ext in dump.age sha256 meta.json; do
  gcloud storage cp \
    gs://icr-db-backups-prod/monthly/backup-<STAMP>.$ext \
    gs://icr-db-backups-prod/permanent/backup-<STAMP>.$ext
done
```

**R2:**

```sh
for ext in dump.age sha256 meta.json; do
  aws s3 cp \
    s3://icr-db-backup-r2/monthly/backup-<STAMP>.$ext \
    s3://icr-db-backup-r2/permanent/backup-<STAMP>.$ext \
    --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
done
```

No `--object-lock-mode` flag — `permanent/` is intentionally never locked (see §3's lock-rule
rationale).

---

## 7. Operator-machine prerequisites

Tools needed on whatever machine runs `restore-db.sh` or `restore-drill.sh` (never a CI runner —
see the break-glass runbook in `backups-and-recovery.md`):

- [`age`](https://github.com/FiloSottile/age) — decrypt
- `postgresql-client` (provides `pg_restore`) — matching or newer major version than the source
  Postgres (18 — what Neon runs and `backup-db.yml` pins for `pg_dump`)
- `gcloud` (Google Cloud CLI) — fetch from GCS
- `jq` — parse `meta.json` sidecars
- `sha256sum` — `restore-drill.sh` calls it by that name; stock macOS only ships `shasum`, so
  install coreutils (`brew install coreutils`) there

---

## 8. Restore drill verification marker

`restore-drill.sh`'s final step (reachable only once decrypt, scratch restore, and the exact
`count(*)` match have all passed) writes `drill-verified.json` to the working bucket root
(`gs://icr-db-backups-prod/drill-verified.json`, not under `daily/`/`monthly/`/`permanent/`) and
uploads it with the operator's own `gcloud storage cp` — the drill only ever holds read access to
the bucket, so this is a deliberately separate, manually-authenticated write. Sample contents:

```json
{
  "verifiedAt": "2026-08-16T14:34:57Z",
  "artifactId": "20260801T071700Z",
  "keyUsed": "A"
}
```

No key material and no operator PII — `keyUsed` is the key *letter* (A or B), not an identity.
The Backups admin tab's storage layer reads this object in the same cached listing pass as the
sidecars (one extra `objects.get`, same 60s TTL); absent (no drill has run yet), malformed, or
wrong-shape objects are all treated as "never verified" rather than erroring the listing.

Since `restore-drill.sh` runs on an operator's own machine (never CI — see §7), it can't infer
which physical key `AGE_IDENTITY_FILE` points at. `DRILL_KEY_USED=A|B` is a required env var,
validated to exactly one of those two values, so the marker's `keyUsed` field is always accurate.
A failed marker write or upload (network blip, stale `gcloud` auth, etc.) never fails the drill
itself — the PASS/FAIL result is already printed by that point. The script instead prints the
exact command (`jq -n ...` or `gcloud storage cp ...`) for the operator to run by hand as a
separate concluding step.

---

## 9. Backups admin tab: keyless GCS auth

The Admin → Backups tab's server routes read GCS keylessly: Vercel OIDC → Workload Identity
Federation, the same mechanism the backup workflow uses for GitHub Actions. No service-account
key exists — the org's `iam.disableServiceAccountKeyCreation` policy stays fully enforced.

Provisioned in `icr-management-system`:

```sh
gcloud iam workload-identity-pools create vercel-backups-pool \
  --location=global \
  --display-name="Vercel — Backups admin tab"

gcloud iam workload-identity-pools providers create-oidc vercel \
  --location=global \
  --workload-identity-pool=vercel-backups-pool \
  --display-name="Vercel OIDC" \
  --issuer-uri="https://oidc.vercel.com/icr-e15f76a6" \
  --allowed-audiences="https://vercel.com/icr-e15f76a6" \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.sub=='owner:icr-e15f76a6:project:ithaca-recovery:environment:production'"

gcloud iam service-accounts create backups-tab-reader \
  --display-name="Backups admin tab — read-only"

gcloud storage buckets add-iam-policy-binding gs://icr-db-backups-prod \
  --member="serviceAccount:backups-tab-reader@icr-management-system.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud storage buckets add-iam-policy-binding gs://icr-db-backups-archive \
  --member="serviceAccount:backups-tab-reader@icr-management-system.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud iam service-accounts add-iam-policy-binding \
  backups-tab-reader@icr-management-system.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principal://iam.googleapis.com/projects/152224493895/locations/global/workloadIdentityPools/vercel-backups-pool/subject/owner:icr-e15f76a6:project:ithaca-recovery:environment:production"

gcloud iam service-accounts add-iam-policy-binding \
  backups-tab-reader@icr-management-system.iam.gserviceaccount.com \
  --role="roles/iam.serviceAccountTokenCreator" \
  --member="serviceAccount:backups-tab-reader@icr-management-system.iam.gserviceaccount.com"
```

The attribute condition accepts **only**
`owner:icr-e15f76a6:project:ithaca-recovery:environment:production` — preview deploys and any
other Vercel project can't impersonate. `backups-tab-reader` holds `roles/storage.objectViewer`
on both GCS buckets (read-only — deliberately not the workflow's create-only identity; read and
write stay separate identities), `roles/iam.workloadIdentityUser` for that single principal, and
`roles/iam.serviceAccountTokenCreator` on itself (keyless V4 signed URLs go through IAM
`signBlob`).

Vercel needs two **non-secret** Production env vars (nothing to rotate or leak), plus OIDC
federation enabled in the Vercel project settings (issuer mode Team):

| Variable | Value |
|---|---|
| `GCP_BACKUPS_WIF_PROVIDER` | `projects/152224493895/locations/global/workloadIdentityPools/vercel-backups-pool/providers/vercel` |
| `GCP_BACKUPS_SERVICE_ACCOUNT` | `backups-tab-reader@icr-management-system.iam.gserviceaccount.com` |

Until those two vars are set and deployed, production's snapshot/health cards show the tab's
"not configured" panel (Back Up Now and Recent Activity work regardless — they only need
`GITHUB_BACKUPS_PAT`).

---

## 10. Running the drill and the restore

Both procedures run through their scripts — never the underlying `age`/`pg_restore` commands by
hand. The scripts' refusals *are* the procedure: they reject pooled (`-pooler`) connection
strings that break `pg_restore`, refuse target databases that don't look like scratch/branch
targets, gate the one irreversible step behind an explicit flag plus a typed confirmation, and do
the exact-`count(*)` verification that makes a result trustworthy. Prerequisites: §7, plus
`gcloud` authenticated as an account that can read the working bucket.

### 10.1 Quarterly drill — `frontend/scripts/restore-drill.sh`

Pulls the newest `monthly/` artifact, verifies its sha256, decrypts it, restores it into a
scratch database, and diffs restored row counts against the sidecar `meta.json` — then uploads
the `drill-verified.json` marker the Backups admin tab reads (§8). Runs from `frontend/`.
Replace before running:

- `AGE_IDENTITY_FILE` — wherever the key actually lives
- `DRILL_TARGET_URL` host — the scratch database's own unpooled Neon host (`ep-xxx…` is a
  sample)

```sh
AGE_IDENTITY_FILE=~/keys/age-key-a.txt \
DRILL_KEY_USED=A \
DRILL_TARGET_URL='postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/icr_drill_scratch' \
./scripts/restore-drill.sh
```

- `DRILL_TARGET_URL` must be **unpooled** and its database name must contain
  `drill`/`scratch`/`test` — the drill runs `pg_restore --clean`, which drops every table in the
  target first. A differently-named scratch DB needs the explicit
  `DRILL_CONFIRM_DBNAME=<dbname>` override.
- `DRILL_KEY_USED` is whichever physical key `AGE_IDENTITY_FILE` is (`A` or `B`) — the script
  can't derive it, and it lands in the marker's `keyUsed` field. **Alternate keys between
  drills**: a two-key design only ever tested with key A is a one-key design nobody's noticed.
- `GCS_BUCKET` overrides the default `icr-db-backups-prod`.

Sample output of a passing run — the dated block is meant to be pasted verbatim into the
handoff log:

```
=== Restore Drill — 2026-08-17 ===
Artifact: gs://icr-db-backups-prod/monthly/backup-20260801T071700Z
Result:   PASS
Tables:   12 checked, 0 mismatches
===================================
```

The marker upload happens automatically after a PASS; if that bookkeeping step fails (network
blip, stale `gcloud` auth), the drill still passed — the script prints the exact `jq`/`gcloud
storage cp` commands to run by hand. On FAIL: a sha256 mismatch means fetch the same artifact
from a different replica (§3's R2 copy) before trusting it; count mismatches are listed
per-table in the output.

### 10.2 Break-glass restore — `frontend/scripts/restore-db.sh`

Unlike the drill, artifact selection is deliberate and by hand. Pick, download, and check the
artifact first. Replace before running:

- `<STAMP>` — the chosen artifact's timestamp, from the `ls` output

```sh
gcloud storage ls gs://icr-db-backups-prod/daily/        # or monthly/, permanent/
gcloud storage cp gs://icr-db-backups-prod/daily/backup-<STAMP>.dump.age .
gcloud storage cp gs://icr-db-backups-prod/daily/backup-<STAMP>.sha256 .
gcloud storage cp gs://icr-db-backups-prod/daily/backup-<STAMP>.meta.json .
sha256sum backup-<STAMP>.dump.age   # must equal the first field of the .sha256 file
# (macOS without coreutils: shasum -a 256 backup-<STAMP>.dump.age)
```

(If GCS is what failed, fetch the same three objects from R2 with the `aws s3 cp` form in §6,
direction reversed, or from the archive bucket.)

Then restore into a **fresh Neon branch** — never the primary. Replace before running:

- `AGE_IDENTITY_FILE` — wherever the key actually lives
- `--target` host — the fresh branch's unpooled host (`ep-xxx-branch-yyy…` is a sample)
- `<STAMP>` — same artifact timestamp as above

```sh
AGE_IDENTITY_FILE=~/keys/age-key-b.txt \
./scripts/restore-db.sh backup-<STAMP>.dump.age \
  --target 'postgresql://user:pass@ep-xxx-branch-yyy.us-east-2.aws.neon.tech/neondb'
```

The script prints exact per-table row counts after restoring — compare them against the
`.meta.json` sidecar's `rowCounts` before going any further. Restoring **over production** is
the runbook's one irreversible step and requires both `--target-is-production` and re-typing the
target host at the interactive prompt; everything before that flag is a dry run by construction.
The surrounding decision steps — when to restore, who coordinates, and the post-restore
write-up — live in the break-glass runbook in
[Backups and Recovery](../02-handoff/backups-and-recovery.md).


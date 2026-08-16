#!/usr/bin/env bash
set -euo pipefail

# Uploads one backup run's artifact (+ sidecars) to a single storage target.
# Called three times per run (once per target) by backup-db.yml, each after
# the auth step for that target's credentials — see the plan's "two auth
# steps" note for why gcs-working/gcs-archive can't share one invocation.

usage() {
  echo "Usage: $0 --target=gcs-working|gcs-archive|r2" >&2
  exit 1
}

TARGET=""
for arg in "$@"; do
  case "$arg" in
    --target=*) TARGET="${arg#--target=}" ;;
    *) usage ;;
  esac
done
[[ -n "$TARGET" ]] || usage

case "$TARGET" in
  gcs-working|gcs-archive|r2) ;;
  *) usage ;;
esac

# Paths to this run's already-produced artifact + sidecars (backup-db.sh's output).
: "${ARTIFACT_PATH:?missing}"
: "${SHA256_PATH:?missing}"
: "${META_PATH:?missing}"

ARTIFACT_NAME="$(basename "$ARTIFACT_PATH")"
SHA256_NAME="$(basename "$SHA256_PATH")"
META_NAME="$(basename "$META_PATH")"

# Same bytes go to daily/ always, plus monthly/ on the 1st — not a re-dump,
# just an additional prefix, because lifecycle/Object-Lock rules key on
# prefix+age, never metadata (see plan's GFS section).
# Day-of-month comes from the artifact's own timestamp (backup-YYYYMMDD...), not
# the upload wall clock — a run crossing midnight must agree with meta.json.tier,
# which backup-db.sh derives from the same creation instant.
ARTIFACT_DAY="$(basename "$ARTIFACT_PATH" | sed -E 's/^backup-[0-9]{6}([0-9]{2})T.*/\1/')"
if [[ ! "$ARTIFACT_DAY" =~ ^[0-9]{2}$ ]]; then
  echo "Cannot parse day-of-month from artifact name: $(basename "$ARTIFACT_PATH")" >&2
  exit 1
fi
TIERS=("daily")
if [[ "$ARTIFACT_DAY" == "01" ]]; then
  TIERS+=("monthly")
fi

# Raw JSON-API insert instead of `gcloud storage cp`: cp stats the destination
# object first, which needs storage.objects.get -- and the CI service accounts
# are deliberately objectCreator-only (create, never read/overwrite). The API
# upload is a pure objects.create. ifGenerationMatch=0 makes create-only explicit:
# the write fails with 412 rather than overwriting if the object somehow exists.
# No Object Lock params here: immutability for GCS targets is bucket-side
# (lifecycle on working, retention policy on archive), not per-object.
gcs_put() {
  local bucket="$1" object="$2" file="$3" http_code
  http_code="$(curl -sS -o /tmp/gcs-upload-response.json -w '%{http_code}' \
    -X POST --data-binary @"$file" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/octet-stream" \
    "https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&ifGenerationMatch=0&name=$(printf '%s' "$object" | jq -sRr @uri)")"
  if [[ "$http_code" != 2* ]]; then
    echo "upload-backup: GCS upload of ${object} to ${bucket} failed (HTTP ${http_code}):" >&2
    cat /tmp/gcs-upload-response.json >&2
    return 1
  fi
}

upload_gcs() {
  local bucket="$1" tier="$2"
  gcs_put "$bucket" "${tier}/${ARTIFACT_NAME}" "$ARTIFACT_PATH"
  gcs_put "$bucket" "${tier}/${SHA256_NAME}" "$SHA256_PATH"
  gcs_put "$bucket" "${tier}/${META_NAME}" "$META_PATH"
}

# Retention is enforced by the bucket's prefix-scoped Bucket Lock rules (daily/ 14d,
# monthly/ 400d), not per-object headers — R2 doesn't implement the S3 per-object
# x-amz-object-lock-* PutObject parameters.
upload_r2() {
  local tier="$1"
  local endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

  aws s3api put-object \
    --endpoint-url "$endpoint" \
    --bucket "$R2_BUCKET" \
    --key "${tier}/${ARTIFACT_NAME}" \
    --body "$ARTIFACT_PATH"
  aws s3api put-object \
    --endpoint-url "$endpoint" \
    --bucket "$R2_BUCKET" \
    --key "${tier}/${SHA256_NAME}" \
    --body "$SHA256_PATH"
  aws s3api put-object \
    --endpoint-url "$endpoint" \
    --bucket "$R2_BUCKET" \
    --key "${tier}/${META_NAME}" \
    --body "$META_PATH"
}

case "$TARGET" in
  gcs-working)
    : "${GCS_WORKING_BUCKET:?missing}"
    for tier in "${TIERS[@]}"; do
      upload_gcs "$GCS_WORKING_BUCKET" "$tier"
    done
    ;;
  gcs-archive)
    : "${GCS_ARCHIVE_BUCKET:?missing}"
    for tier in "${TIERS[@]}"; do
      upload_gcs "$GCS_ARCHIVE_BUCKET" "$tier"
    done
    ;;
  r2)
    : "${R2_ACCOUNT_ID:?missing}"
    : "${R2_BUCKET:?missing}"
    : "${R2_ACCESS_KEY_ID:?missing}"
    : "${R2_SECRET_ACCESS_KEY:?missing}"
    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    for tier in "${TIERS[@]}"; do
      upload_r2 "$tier"
    done
    ;;
esac

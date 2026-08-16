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

upload_gcs() {
  local bucket="$1" tier="$2"
  # No Object Lock flags here: immutability for GCS targets is bucket-side
  # (lifecycle on working, retention policy on archive), not per-object.
  gcloud storage cp "$ARTIFACT_PATH" "gs://${bucket}/${tier}/${ARTIFACT_NAME}"
  gcloud storage cp "$SHA256_PATH" "gs://${bucket}/${tier}/${SHA256_NAME}"
  gcloud storage cp "$META_PATH" "gs://${bucket}/${tier}/${META_NAME}"
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

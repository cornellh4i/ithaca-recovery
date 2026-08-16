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
TIERS=("daily")
if [[ "$(date -u +%d)" == "01" ]]; then
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

upload_r2() {
  local tier="$1" retain_days="$2"
  local retain_until
  retain_until="$(date -u -d "+${retain_days} days" +%Y-%m-%dT%H:%M:%SZ)"
  local endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

  aws s3api put-object \
    --endpoint-url "$endpoint" \
    --bucket "$R2_BUCKET" \
    --key "${tier}/${ARTIFACT_NAME}" \
    --body "$ARTIFACT_PATH" \
    --object-lock-mode GOVERNANCE \
    --object-lock-retain-until-date "$retain_until"
  aws s3api put-object \
    --endpoint-url "$endpoint" \
    --bucket "$R2_BUCKET" \
    --key "${tier}/${SHA256_NAME}" \
    --body "$SHA256_PATH" \
    --object-lock-mode GOVERNANCE \
    --object-lock-retain-until-date "$retain_until"
  aws s3api put-object \
    --endpoint-url "$endpoint" \
    --bucket "$R2_BUCKET" \
    --key "${tier}/${META_NAME}" \
    --body "$META_PATH" \
    --object-lock-mode GOVERNANCE \
    --object-lock-retain-until-date "$retain_until"
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
    # Retain-until set a few days shorter than the matching lifecycle-delete
    # age (14d lock/21d delete, 400d lock/407d delete) so the delete never
    # races a still-locked object — see plan's GFS section.
    for tier in "${TIERS[@]}"; do
      case "$tier" in
        daily) upload_r2 "$tier" 14 ;;
        monthly) upload_r2 "$tier" 400 ;;
      esac
    done
    ;;
esac

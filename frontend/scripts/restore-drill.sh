#!/usr/bin/env bash
# Quarterly non-destructive restore drill: pulls the newest monthly/ artifact, restores it
# into a scratch DB, and diffs restored row counts against the sidecar meta.json's rowCounts.
# "A backup that's never been test-restored isn't a backup" — this is the thing that proves
# it. Output is a dated PASS/FAIL block meant to be pasted into the handoff log verbatim.
#
# Usage: restore-drill.sh
#
# Env:
#   AGE_IDENTITY_FILE   path to an `age` private key file (holder A or B; either suffices)
#   DRILL_TARGET_URL    unpooled connection string for a scratch DB (new/reset each drill)
#   GCS_BUCKET           bucket to pull the monthly/ artifact from (default: icr-db-backups-prod)
set -euo pipefail

: "${AGE_IDENTITY_FILE:?missing}"
: "${DRILL_TARGET_URL:?missing}"
GCS_BUCKET="${GCS_BUCKET:-icr-db-backups-prod}"

if [[ ! -f "$AGE_IDENTITY_FILE" ]]; then
  echo "age identity file not found: $AGE_IDENTITY_FILE" >&2
  exit 1
fi

# Same refusal as restore-db.sh: pgbouncer's transaction-mode pooling breaks pg_restore's
# session-level operations. The drill target must be a real scratch DB, never pooled.
if [[ "$DRILL_TARGET_URL" == *-pooler* ]]; then
  echo "Refusing: DRILL_TARGET_URL contains '-pooler'. pg_restore requires an unpooled" \
       "connection string." >&2
  exit 1
fi

WORKDIR="$(mktemp -d -t restore-drill.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

DRILL_DATE="$(date -u +%Y-%m-%d)"

echo "Finding newest monthly/ artifact in gs://$GCS_BUCKET/monthly/..."
NEWEST_META="$(gcloud storage ls "gs://$GCS_BUCKET/monthly/*.meta.json" \
  | sort \
  | tail -n 1)"

if [[ -z "$NEWEST_META" ]]; then
  echo "No monthly/ artifacts found in gs://$GCS_BUCKET/monthly/." >&2
  exit 1
fi

# meta.json's filename shares its stem with the .age/.sha256 siblings uploaded alongside it
# in the same run (upload-backup.sh writes all three under one basename).
ARTIFACT_STEM="${NEWEST_META%.meta.json}"
ENCRYPTED_OBJECT="${ARTIFACT_STEM}.age"
SHA256_OBJECT="${ARTIFACT_STEM}.sha256"

echo "Downloading $ARTIFACT_STEM.{age,sha256,meta.json}..."
gcloud storage cp "$ENCRYPTED_OBJECT" "$WORKDIR/backup.age"
gcloud storage cp "$SHA256_OBJECT" "$WORKDIR/backup.sha256"
gcloud storage cp "$NEWEST_META" "$WORKDIR/meta.json"

echo "Verifying sha256 against sidecar..."
EXPECTED_SHA256="$(awk '{print $1}' "$WORKDIR/backup.sha256")"
ACTUAL_SHA256="$(sha256sum "$WORKDIR/backup.age" | awk '{print $1}')"
if [[ "$EXPECTED_SHA256" != "$ACTUAL_SHA256" ]]; then
  cat <<EOF

=== Restore Drill — $DRILL_DATE ===
Artifact: $ARTIFACT_STEM
Result:   FAIL
Reason:   sha256 mismatch (expected $EXPECTED_SHA256, got $ACTUAL_SHA256) — fetch a
          different replica before trusting this artifact.
===================================
EOF
  exit 1
fi

echo "Decrypting..."
age -d -i "$AGE_IDENTITY_FILE" -o "$WORKDIR/backup.dump" "$WORKDIR/backup.age"

echo "Restoring into scratch DB..."
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$DRILL_TARGET_URL" "$WORKDIR/backup.dump"

echo "Comparing row counts against meta.json's rowCounts (exact match expected — both" \
  "describe the same frozen artifact)..."

RESTORED_COUNTS_JSON="$(psql "$DRILL_TARGET_URL" -Atc "
  select coalesce(jsonb_object_agg(relname, n_live_tup), '{}'::jsonb)
  from pg_stat_user_tables;
")"

MISMATCHES="$(jq -n \
  --argjson expected "$(jq '.rowCounts' "$WORKDIR/meta.json")" \
  --argjson actual "$RESTORED_COUNTS_JSON" \
  '[
     ($expected | keys[]) as $table
     | {table: $table, expected: $expected[$table], actual: ($actual[$table] // null)}
     | select(.expected != .actual)
   ]')"

MISMATCH_COUNT="$(echo "$MISMATCHES" | jq 'length')"

if [[ "$MISMATCH_COUNT" -eq 0 ]]; then
  cat <<EOF

=== Restore Drill — $DRILL_DATE ===
Artifact: $ARTIFACT_STEM
Result:   PASS
Tables:   $(jq '.rowCounts | length' "$WORKDIR/meta.json") checked, 0 mismatches
===================================
EOF
else
  cat <<EOF

=== Restore Drill — $DRILL_DATE ===
Artifact: $ARTIFACT_STEM
Result:   FAIL
Mismatches ($MISMATCH_COUNT):
$(echo "$MISMATCHES" | jq -r '.[] | "  \(.table): expected \(.expected), got \(.actual)"')
===================================
EOF
  exit 1
fi

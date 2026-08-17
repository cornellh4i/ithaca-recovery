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
#   DRILL_KEY_USED      which physical key AGE_IDENTITY_FILE is (A or B) -- the script can't
#                        derive this from the key file itself, so it must be told
#   GCS_BUCKET           bucket to pull the monthly/ artifact from (default: icr-db-backups-prod)
set -euo pipefail

: "${AGE_IDENTITY_FILE:?missing}"
: "${DRILL_TARGET_URL:?missing}"
: "${DRILL_KEY_USED:?missing (set to A or B -- whichever physical key AGE_IDENTITY_FILE is)}"
GCS_BUCKET="${GCS_BUCKET:-icr-db-backups-prod}"

if [[ "$DRILL_KEY_USED" != "A" && "$DRILL_KEY_USED" != "B" ]]; then
  echo "DRILL_KEY_USED must be exactly 'A' or 'B', got: $DRILL_KEY_USED" >&2
  exit 1
fi

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

# The drill runs pg_restore --clean, which drops every table in the target first --
# pointing it at production by accident (the unpooled prod string passes the -pooler
# check by construction) must be a hard stop, not a footgun. Require the target DB
# name to look like a scratch DB, or an explicit typed override.
DRILL_DBNAME="${DRILL_TARGET_URL##*/}"
DRILL_DBNAME="${DRILL_DBNAME%%\?*}"
if [[ ! "$DRILL_DBNAME" =~ (drill|scratch|test) && "${DRILL_CONFIRM_DBNAME:-}" != "$DRILL_DBNAME" ]]; then
  echo "Refusing: target database '$DRILL_DBNAME' doesn't look like a scratch DB" \
       "(name lacks drill/scratch/test). The drill DROPS every table in the target." >&2
  echo "If this really is a scratch DB, re-run with DRILL_CONFIRM_DBNAME=$DRILL_DBNAME" >&2
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
ENCRYPTED_OBJECT="${ARTIFACT_STEM}.dump.age"
SHA256_OBJECT="${ARTIFACT_STEM}.sha256"

echo "Downloading $ARTIFACT_STEM.{dump.age,sha256,meta.json}..."
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

# Real count(*) per table, matching exactly how backup-db.sh built rowCounts --
# pg_stat_user_tables.n_live_tup is an estimate the stats system doesn't guarantee,
# and an exact-match PASS/FAIL must not depend on an approximation.
RESTORED_COUNTS_JSON="{}"
while IFS= read -r table; do
  # Table names come from the unencrypted (attacker-writable) sidecar — escape
  # embedded double quotes so they can't break out of the SQL identifier.
  quoted_table="${table//\"/\"\"}"
  count="$(psql "$DRILL_TARGET_URL" -tAc "SELECT count(*) FROM \"${quoted_table}\";")"
  RESTORED_COUNTS_JSON="$(jq -n --argjson acc "$RESTORED_COUNTS_JSON" \
    --arg t "$table" --argjson c "$count" '$acc + {($t): $c}')"
done < <(jq -r '.rowCounts | keys[]' "$WORKDIR/meta.json")

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

  # Final step, reachable only once every check above has passed. Writes the
  # drill-verified.json marker the Backups admin tab reads (no key material, no operator
  # PII — see docs/03-development/backup-infra-setup.md's marker-contract section) and
  # uploads it with the operator's own gcloud credentials, since the drill itself only holds
  # read access to the working bucket.
  ARTIFACT_ID="$(basename "$ARTIFACT_STEM")"
  ARTIFACT_ID="${ARTIFACT_ID#backup-}"
  # Absolute path, written to the invoking directory (not $WORKDIR, which the EXIT trap
  # deletes) -- both the jq write and the printed fallback command below need a path that's
  # still valid after $WORKDIR is gone.
  MARKER_FILE="$(pwd)/drill-verified.json"

  # A PASSED drill must exit 0 even if this bookkeeping step fails -- under set -euo pipefail,
  # a failed jq write or gcloud upload would otherwise make a passing drill exit non-zero and
  # look like a failure to anything checking the exit code.
  if ! jq -n \
    --arg verifiedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg artifactId "$ARTIFACT_ID" \
    --arg keyUsed "$DRILL_KEY_USED" \
    '{verifiedAt: $verifiedAt, artifactId: $artifactId, keyUsed: $keyUsed}' > "$MARKER_FILE"; then
    echo "Marker write failed -- the drill still passed. Run by hand:" >&2
    echo "  jq -n --arg verifiedAt \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --arg artifactId $ARTIFACT_ID" \
      "--arg keyUsed $DRILL_KEY_USED '{verifiedAt: \$verifiedAt, artifactId: \$artifactId, keyUsed: \$keyUsed}' > $MARKER_FILE" >&2
  elif ! gcloud storage cp "$MARKER_FILE" "gs://$GCS_BUCKET/drill-verified.json"; then
    echo "Marker upload failed -- the drill still passed. Run by hand:" >&2
    echo "  gcloud storage cp $MARKER_FILE gs://$GCS_BUCKET/drill-verified.json" >&2
  fi
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

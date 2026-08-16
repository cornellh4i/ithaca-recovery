#!/usr/bin/env bash
# Break-glass restore: decrypt an archived dump and pg_restore it, defaulting to a fresh
# Neon branch — never the primary. See docs/02-handoff/backups-and-recovery.md ("Break-glass
# restore") for the full runbook this script implements step 4-6 of.
#
# Usage: restore-db.sh <encrypted-file> [--target <url>] [--target-is-production]
#
# Env:
#   AGE_IDENTITY_FILE      path to an `age` private key file (holder A or B; either suffices)
#   RESTORE_TARGET_URL     default target if --target is not passed
set -euo pipefail

usage() {
  echo "Usage: $0 <encrypted-file> [--target <url>] [--target-is-production]" >&2
  exit 1
}

: "${AGE_IDENTITY_FILE:?missing}"

if [[ ! -f "$AGE_IDENTITY_FILE" ]]; then
  echo "age identity file not found: $AGE_IDENTITY_FILE" >&2
  exit 1
fi

ENCRYPTED_FILE=""
TARGET_URL="${RESTORE_TARGET_URL:-}"
TARGET_IS_PRODUCTION=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || usage
      TARGET_URL="$2"
      shift 2
      ;;
    --target-is-production)
      TARGET_IS_PRODUCTION=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      if [[ -n "$ENCRYPTED_FILE" ]]; then
        usage
      fi
      ENCRYPTED_FILE="$1"
      shift
      ;;
  esac
done

[[ -n "$ENCRYPTED_FILE" ]] || usage
[[ -f "$ENCRYPTED_FILE" ]] || { echo "encrypted file not found: $ENCRYPTED_FILE" >&2; exit 1; }
: "${TARGET_URL:?missing (pass --target <url> or set RESTORE_TARGET_URL)}"

# pgbouncer's transaction-mode pooling breaks pg_restore's session-level operations
# (advisory locks, SET statements) — refuse unconditionally, no override flag exists.
if [[ "$TARGET_URL" == *-pooler* ]]; then
  echo "Refusing: target URL contains '-pooler'. pg_restore requires an unpooled" \
       "connection string." >&2
  exit 1
fi

# INVARIANT: restoring over production is the one irreversible step in the break-glass
# runbook (step 7) — everything before it must be a dry run. Require the operator to say so
# explicitly rather than infer "looks like a branch" from the URL; the heuristic below is
# advisory only.
if [[ "$TARGET_IS_PRODUCTION" != true ]]; then
  case "$TARGET_URL" in
    *neon.tech*branch*|*-branch-*)
      ;;
    *)
      echo "Target URL doesn't look like a Neon branch connection string. If this really" \
           "is a scratch/branch target, no action needed — this check is advisory. If it's" \
           "production, re-run with --target-is-production." >&2
      ;;
  esac
fi

DECRYPTED_FILE="$(mktemp -t restore-db.XXXXXX.dump)"
trap 'rm -f "$DECRYPTED_FILE"' EXIT

echo "Decrypting $ENCRYPTED_FILE..."
age -d -i "$AGE_IDENTITY_FILE" -o "$DECRYPTED_FILE" "$ENCRYPTED_FILE"

if [[ "$TARGET_IS_PRODUCTION" == true ]]; then
  echo "!! Restoring over --target-is-production. This is the irreversible step of the" \
       "break-glass runbook (step 7) — confirm the target URL is correct: $TARGET_URL" >&2
  read -r -p "Type the target host to confirm: " CONFIRM_HOST
  TARGET_HOST="$(echo "$TARGET_URL" | sed -E 's#^[a-zA-Z]+://[^@]*@##; s#/.*##; s#:.*##')"
  if [[ "$CONFIRM_HOST" != "$TARGET_HOST" ]]; then
    echo "Confirmation did not match host ($TARGET_HOST). Aborting." >&2
    exit 1
  fi
fi

echo "Restoring into $TARGET_URL..."
pg_restore --no-owner --no-privileges --dbname="$TARGET_URL" "$DECRYPTED_FILE"

echo
echo "Post-restore row counts:"
# Exact count(*) rather than pg_stat_user_tables.n_live_tup -- the runbook compares
# these against the sidecar's rowCounts, and an estimate can mismatch a correct restore.
psql "$TARGET_URL" -Atc "select relname from pg_stat_user_tables order by relname;" \
  | while IFS= read -r table_name; do
  row_count="$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM \"${table_name}\";")"
  printf '  %-40s %s\n' "$table_name" "$row_count"
done

echo
echo "Restore complete. Verify row counts against the sidecar meta.json's rowCounts before" \
     "cutting over (break-glass runbook step 6)."

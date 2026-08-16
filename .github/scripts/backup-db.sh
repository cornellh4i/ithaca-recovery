#!/usr/bin/env bash
set -euo pipefail

# Dumps production Postgres, restores it into a scratch container to verify the dump is actually
# restorable (not just "pg_dump exited 0"), then encrypts + checksums + emits meta.json. Called
# once per workflow run by .github/workflows/backup-db.yml (B1); the three-way upload is a
# separate script (upload-backup.sh, B3) so this one never needs cloud credentials.
#
# Required env vars:
#   DATABASE_URL_UNPOOLED   Neon connection string with pooling off (pgbouncer breaks pg_dump's
#                            session-level operations -- see plan's "Design decisions").
#   SCRATCH_DATABASE_URL     Connection string for the workflow's `services: postgres:18` scratch
#                            container, e.g. postgresql://postgres:postgres@localhost:5432/scratch.
#                            Owned by this script/B1's contract; cross-check with B1's service
#                            definition and B9.
#   AGE_PUBLIC_KEY_A         age recipient public key, Maintenance Lead custody.
#   AGE_PUBLIC_KEY_B         age recipient public key, org-owned vault custody.
#   BACKUP_SOURCE            "automatic" | "manual" -- passed straight into meta.json.
#   BACKUP_TRIGGERED_BY      Actor login for a manual run, or empty/"null" for scheduled runs.
#   BACKUP_REASON            workflow_dispatch `reason` input, or empty/"null" for scheduled runs.
#
# Optional env vars (fall back to "unknown" in meta.json if unset -- never fatal):
#   PG_VERSION, APP_VERSION, GIT_SHA
#
# Outputs (written to $PWD, consumed by upload-backup.sh):
#   backup-<id>.dump.age   encrypted backup artifact
#   backup-<id>.sha256     sha256 of the .age file, `sha256sum`-verifiable format
#   backup-<id>.meta.json  unencrypted sidecar (schema: plan's "meta.json sidecar schema")

: "${DATABASE_URL_UNPOOLED:?missing}"
: "${SCRATCH_DATABASE_URL:?missing}"
: "${AGE_PUBLIC_KEY_A:?missing}"
: "${AGE_PUBLIC_KEY_B:?missing}"
: "${BACKUP_SOURCE:?missing}"
: "${BACKUP_TRIGGERED_BY:=null}"
: "${BACKUP_REASON:=null}"
# Recorded so a break-glass restore years later can check pg_restore compatibility
# before trusting the artifact; queried live rather than trusted from an env var.
PG_VERSION="$(psql "$DATABASE_URL_UNPOOLED" -tAc 'show server_version;' || echo unknown)"
: "${APP_VERSION:=unknown}"
: "${GIT_SHA:=unknown}"

# UTC timestamp is the artifact id -- also doubles as a sortable, collision-proof filename prefix
# across four runs/day.
id="$(date -u +%Y%m%dT%H%M%SZ)"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
dump_file="backup-${id}.dump"
encrypted_file="backup-${id}.dump.age"
sha_file="backup-${id}.sha256"
meta_file="backup-${id}.meta.json"

# The plaintext dump holds attendance data for a recovery center -- must never survive past this
# script's own process, success or failure, so the trap (not just the happy path) removes it.
cleanup() {
  rm -f "$dump_file"
}
trap cleanup EXIT

pg_dump "$DATABASE_URL_UNPOOLED" \
  --format=custom \
  --compress=gzip:6 \
  --no-owner \
  --no-privileges \
  --file="$dump_file"

size_bytes="$(wc -c <"$dump_file" | tr -d '[:space:]')"

# `pg_restore --list` parsing with a non-zero TOC is itself an assertion: a truncated/corrupt dump
# either fails to parse or produces an empty table of contents.
toc_entry_count="$(pg_restore --list "$dump_file" | grep -c -v '^;' || true)"
if [[ "$toc_entry_count" -eq 0 ]]; then
  echo "backup-db: pg_restore --list produced an empty TOC -- dump is unusable" >&2
  exit 1
fi

# Restore into the scratch container so verification runs against a real restored database, not
# assumptions about the dump's bytes. Schema is expected empty going in (fresh service container).
pg_restore \
  --no-owner \
  --no-privileges \
  --dbname="$SCRATCH_DATABASE_URL" \
  "$dump_file"

expected_tables=(Admin Meeting RecurrencePattern SuspensionPeriod User LeaseSettings MeetingExportSettings)
for table in "${expected_tables[@]}"; do
  present="$(psql "$SCRATCH_DATABASE_URL" -tAc \
    "SELECT to_regclass('public.\"${table}\"') IS NOT NULL;")"
  if [[ "$present" != "t" ]]; then
    echo "backup-db: restored database is missing expected table \"${table}\"" >&2
    exit 1
  fi
done

# An empty restored canary table only means corruption if the SOURCE has rows -- production
# launched with zero meetings, so "empty" must be judged against the live table, not assumed.
# Still catches the real failure (dump against the wrong/blank database) whenever the source
# is populated; Admin can never legitimately be empty (the app is unusable without one).
for table in Admin Meeting; do
  count="$(psql "$SCRATCH_DATABASE_URL" -tAc "SELECT count(*) FROM \"${table}\";")"
  source_count="$(psql "$DATABASE_URL_UNPOOLED" -tAc "SELECT count(*) FROM \"${table}\";")"
  if [[ "$count" -eq 0 && ( "$table" == "Admin" || "$source_count" -gt 0 ) ]]; then
    echo "backup-db: restored table \"${table}\" is empty (source has ${source_count} rows)" >&2
    exit 1
  fi
done

# An orphan here (child row whose parent Meeting doesn't exist) means real corruption, not a race
# -- the dump is one REPEATABLE READ snapshot, so parent and child rows are always consistent with
# each other at dump time.
orphan_recurrence="$(psql "$SCRATCH_DATABASE_URL" -tAc \
  'SELECT count(*) FROM "RecurrencePattern" rp
   LEFT JOIN "Meeting" m ON m.mid = rp.mid
   WHERE m.mid IS NULL;')"
if [[ "$orphan_recurrence" -ne 0 ]]; then
  echo "backup-db: found ${orphan_recurrence} orphaned RecurrencePattern row(s)" >&2
  exit 1
fi

orphan_suspension="$(psql "$SCRATCH_DATABASE_URL" -tAc \
  'SELECT count(*) FROM "SuspensionPeriod" sp
   LEFT JOIN "Meeting" m ON m.mid = sp.mid
   WHERE m.mid IS NULL;')"
if [[ "$orphan_suspension" -ne 0 ]]; then
  echo "backup-db: found ${orphan_suspension} orphaned SuspensionPeriod row(s)" >&2
  exit 1
fi

# Row counts recorded from the restored copy become meta.json's `rowCounts` -- both the
# authoritative verification artifact and restore-drill.sh's exact-match comparison target.
row_counts_json="{}"
for table in "${expected_tables[@]}"; do
  count="$(psql "$SCRATCH_DATABASE_URL" -tAc "SELECT count(*) FROM \"${table}\";")"
  row_counts_json="$(echo "$row_counts_json" | jq --arg t "$table" --argjson c "$count" '. + {($t): $c}')"
done

# Advisory-only: comparing against *live* production (not the snapshot restore) is a real race,
# since ordinary concurrent writes after pg_dump's snapshot started would look like "drift" that
# isn't actually a problem. Never gates the run -- only ever a warning line in the job log.
live_meeting_count="$(psql "$DATABASE_URL_UNPOOLED" -tAc 'SELECT count(*) FROM "Meeting";' || echo "")"
restored_meeting_count="$(echo "$row_counts_json" | jq -r '.Meeting')"
if [[ -n "$live_meeting_count" && "$live_meeting_count" =~ ^[0-9]+$ ]]; then
  diff=$(( live_meeting_count > restored_meeting_count ? live_meeting_count - restored_meeting_count : restored_meeting_count - live_meeting_count ))
  if [[ "$live_meeting_count" -gt 0 ]]; then
    pct=$(( diff * 100 / live_meeting_count ))
  else
    pct=0
  fi
  if [[ "$diff" -gt 50 && "$pct" -gt 2 ]]; then
    echo "backup-db: WARNING (advisory only) -- live Meeting count ($live_meeting_count) drifts" \
      "from restored snapshot ($restored_meeting_count) by ${diff} rows (${pct}%)" >&2
  fi
fi

age -r "$AGE_PUBLIC_KEY_A" -r "$AGE_PUBLIC_KEY_B" -o "$encrypted_file" "$dump_file"

sha256sum "$encrypted_file" >"$sha_file"
sha256_hex="$(cut -d ' ' -f1 "$sha_file")"

verified_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Deliberately unencrypted (see plan's "Decryption requirements and key rotation") -- the admin UI
# reads this to render the backup inventory without holding a private key. Never add anything here
# that wouldn't be safe to publish.
jq -n \
  --arg id "$id" \
  --arg createdAt "$created_at" \
  --arg source "$BACKUP_SOURCE" \
  --arg triggeredBy "$BACKUP_TRIGGERED_BY" \
  --arg reason "$BACKUP_REASON" \
  --argjson sizeBytes "$size_bytes" \
  --arg sha256 "$sha256_hex" \
  --arg pgVersion "$PG_VERSION" \
  --arg appVersion "$APP_VERSION" \
  --arg gitSha "$GIT_SHA" \
  --arg keyA "$AGE_PUBLIC_KEY_A" \
  --arg keyB "$AGE_PUBLIC_KEY_B" \
  --argjson rowCounts "$row_counts_json" \
  --arg verifiedAt "$verified_at" \
  '{
    id: $id,
    createdAt: $createdAt,
    # tier = highest tier reached this run, not which prefix a given copy lives
    # under -- on the 1st the same bytes land in both daily/ and monthly/, and
    # both copies carry this one sidecar saying "monthly".
    tier: (if ($createdAt | .[8:10]) == "01" then "monthly" else "daily" end),
    source: $source,
    triggeredBy: (if $triggeredBy == "null" or $triggeredBy == "" then null else $triggeredBy end),
    reason: (if $reason == "null" or $reason == "" then null else $reason end),
    sizeBytes: $sizeBytes,
    sha256: $sha256,
    pgVersion: $pgVersion,
    appVersion: $appVersion,
    gitSha: $gitSha,
    ageRecipients: [$keyA, $keyB],
    rowCounts: $rowCounts,
    verified: true,
    verificationMode: "structural",
    verifiedAt: $verifiedAt
  }' >"$meta_file"
# No "replicas" field: the sidecar is written before any upload runs, so it cannot
# honestly claim where copies landed -- replica truth lives in the workflow's per-target
# step outcomes (and, for the admin UI, per-target listings).

echo "backup-db: wrote ${encrypted_file}, ${sha_file}, ${meta_file}"

# Hand the timestamped filenames to the workflow's upload steps (GITHUB_OUTPUT is
# absent when run outside Actions, e.g. a local dry run -- skip silently then).
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "artifact=${encrypted_file}"
    echo "sha256=${sha_file}"
    echo "meta=${meta_file}"
  } >>"$GITHUB_OUTPUT"
fi

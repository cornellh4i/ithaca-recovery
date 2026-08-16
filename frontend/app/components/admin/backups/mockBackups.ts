// Deterministic GFS-shaped fixtures for the Backups admin tab. UI-only in this PR — every
// generator takes an explicit `now: Date` argument rather than reading Date.now()/Math.random()
// at call time, so SSR and tests render the exact same fixture on every run (the repo also bans
// local-timezone Date APIs via ESLint — all construction below is UTC-anchored via Date.UTC).
import type {
  ActivityConclusion,
  ActivityEvent,
  ActivityTrigger,
  BackupFreshness,
  BackupHealth,
  BackupListRow,
  BackupMeta,
  BackupReplica,
  BackupReplicaStatus,
  BackupSource,
  BackupTier,
} from "../../../../types/backups";
import { ALL_BACKUP_REPLICAS } from "../../../../types/backups";

// The workflow's actual cron: `17 1,7,13,19 * * *` UTC — four runs/day, 6h apart.
const CRON_HOURS_UTC = [1, 7, 13, 19];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DAILY_EXPIRY_DAYS = 21;
const MONTHLY_EXPIRY_DAYS = 407;

const GCS_WORKING_BUCKET = "gs://icr-db-backups-prod";
const GCS_ARCHIVE_BUCKET = "gs://icr-db-backups-archive";
const R2_BUCKET = "icr-db-backup-r2";

export const BACKUP_BUCKETS = {
  "gcs-working": GCS_WORKING_BUCKET,
  "gcs-archive": GCS_ARCHIVE_BUCKET,
  r2: R2_BUCKET,
} satisfies Record<BackupReplica, string>;

/** Small pseudo-random generator seeded by index — deterministic across runs, unlike Math.random(). */
function seededFraction(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function hexDigits(seed: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(seededFraction(seed * 97 + i) * 16).toString(16);
  }
  return out;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** `yyyymmddThhmmssZ`, the timestamp format baked into every artifact filename. */
function formatArtifactTimestamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}` +
    `T${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}Z`
  );
}

function backupId(date: Date): string {
  return `backup-${formatArtifactTimestamp(date)}`;
}

export function artifactFileName(row: Pick<BackupMeta, "createdAt">): string {
  return `${backupId(new Date(row.createdAt))}.dump.age`;
}

/** Mirrors the real GFS deletion rule: daily deletes at 21d, monthly at 407d, permanent never. */
export function computeExpiresAt(tier: BackupTier, createdAt: string): string | null {
  if (tier === "permanent") return null;
  const days = tier === "daily" ? DAILY_EXPIRY_DAYS : MONTHLY_EXPIRY_DAYS;
  return new Date(new Date(createdAt).getTime() + days * DAY_MS).toISOString();
}

/** Most recent cron slot at or before `from`, per `17 1,7,13,19 * * *` UTC. */
function latestCronSlotAtOrBefore(from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 17, 0));
  let best: Date | null = null;
  for (const h of CRON_HOURS_UTC) {
    const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), h, 17, 0));
    if (candidate.getTime() <= from.getTime() && (!best || candidate.getTime() > best.getTime())) {
      best = candidate;
    }
  }
  if (best) return best;
  // Every slot today is still ahead of `from` — fall back to yesterday's last (19:17) slot.
  const yesterday = new Date(d.getTime() - DAY_MS);
  return new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 19, 17, 0));
}

function stepBackOneCronSlot(from: Date): Date {
  return latestCronSlotAtOrBefore(new Date(from.getTime() - 1));
}

interface BuildRowOptions {
  index: number;
  createdAt: Date;
  tier: BackupTier;
  source?: BackupSource;
  verified?: boolean;
  replicas?: BackupReplica[];
}

const SAMPLE_ROW_COUNTS: Record<string, number> = {
  meetings: 812,
  users: 46,
  suspensions: 3,
  conflicts: 1,
};

function buildRow({ index, createdAt, tier, source = "automatic", verified = true, replicas = [...ALL_BACKUP_REPLICAS] }: BuildRowOptions): BackupListRow {
  const createdAtIso = createdAt.toISOString();
  const id = backupId(createdAt);
  const triggeredBy = source === "manual" ? "admin@ithacarecovery.org" : null;
  // ~3-8 MB, deterministic per row rather than a fixed constant, so the Size column isn't
  // visually identical across every fixture row.
  const sizeBytes = Math.round((3 + seededFraction(index) * 5) * 1024 * 1024);

  const meta: BackupMeta = {
    id,
    createdAt: createdAtIso,
    tier,
    source,
    triggeredBy,
    reason: source === "manual" ? "Pre-deploy safety snapshot" : null,
    sizeBytes,
    sha256: hexDigits(index, 64),
    pgVersion: "16.4",
    appVersion: "2026.8.1",
    gitSha: hexDigits(index + 1000, 7),
    ageRecipients: [`age1${hexDigits(index + 2000, 58)}`, `age1${hexDigits(index + 3000, 58)}`],
    rowCounts: SAMPLE_ROW_COUNTS,
    verified,
    verificationMode: "structural",
    verifiedAt: verified ? new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString() : null,
  };

  return {
    ...meta,
    replicas,
    expiresAt: computeExpiresAt(tier, createdAtIso),
  };
}

/**
 * GFS-shaped snapshot inventory: ~14 daily rows (4/day cadence), 13 monthly rows, 1 permanent
 * row, plus the required edge cases — one unverified row, one single-replica row, and one row
 * missing from exactly one of the three storage targets.
 */
export function generateMockBackupRows(now: Date): BackupListRow[] {
  const rows: BackupListRow[] = [];

  // Daily tier: walk backward one cron slot (6h) at a time from the most recent run.
  let cursor = latestCronSlotAtOrBefore(now);
  for (let i = 0; i < 14; i += 1) {
    let replicas: BackupReplica[] = [...ALL_BACKUP_REPLICAS];
    let verified = true;
    if (i === 3) {
      // Required edge case: unverified row (structural check hasn't landed yet for this run).
      verified = false;
    }
    if (i === 6) {
      // Required edge case: single-replica row (only the working bucket got the upload before
      // a transient archive/R2 failure).
      replicas = ["gcs-working"];
    }
    if (i === 9) {
      // Required edge case: missing from exactly one of the three targets.
      replicas = ["gcs-working", "gcs-archive"];
    }
    rows.push(buildRow({ index: i, createdAt: cursor, tier: "daily", source: i === 5 ? "manual" : "automatic", verified, replicas }));
    cursor = stepBackOneCronSlot(cursor);
  }

  // Monthly tier: one row roughly every 30 days, continuing further back than the dailies.
  let monthlyCursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 1, 17, 0));
  if (monthlyCursor.getTime() > now.getTime() - 30 * DAY_MS) {
    monthlyCursor = new Date(monthlyCursor.getTime() - 30 * DAY_MS);
  }
  for (let i = 0; i < 13; i += 1) {
    rows.push(buildRow({ index: i + 100, createdAt: monthlyCursor, tier: "monthly" }));
    monthlyCursor = new Date(monthlyCursor.getTime() - 30 * DAY_MS);
  }

  // Permanent tier: a single manually-pinned row, oldest of all.
  const permanentAt = new Date(monthlyCursor.getTime() - 60 * DAY_MS);
  rows.push(
    buildRow({
      index: 999,
      createdAt: permanentAt,
      tier: "permanent",
      source: "manual",
    }),
  );

  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function freshnessFor(lastSuccessfulBackupAt: string, now: Date): BackupFreshness {
  const ageHours = (now.getTime() - new Date(lastSuccessfulBackupAt).getTime()) / HOUR_MS;
  if (ageHours >= 72) return "error";
  if (ageHours >= 26) return "warn";
  return "ok";
}

/** Next cron fire time strictly after `now`, per `17 1,7,13,19 * * *` UTC. */
export function nextScheduledRunAfter(now: Date): string {
  let candidate = new Date(latestCronSlotAtOrBefore(now).getTime());
  while (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 6 * HOUR_MS);
  }
  return candidate.toISOString();
}

export const FREE_TIER_LIMITS = {
  // GCS Standard free tier: 5 GB-months regional storage.
  gcsWorkingBytes: 5 * 1024 * 1024 * 1024,
  gcsArchiveBytes: 5 * 1024 * 1024 * 1024,
  // R2's free tier: 10 GB-months.
  r2Bytes: 10 * 1024 * 1024 * 1024,
};

/** Derives BackupHealth from a fixture row set — mirrors how the real API composes it from
 * a GCS/R2 listing plus the latest workflow run, so Wave 1 components see realistic shapes. */
export function generateMockBackupHealth(now: Date, rows: BackupListRow[] = generateMockBackupRows(now)): BackupHealth {
  const latest = rows[0];
  const lastSuccessfulBackupAt = latest ? latest.createdAt : null;

  const replicaStatus: BackupReplicaStatus[] = ALL_BACKUP_REPLICAS.map((replica) => ({
    replica,
    objectCount: rows.filter((r) => r.replicas.includes(replica)).length,
    hasLatest: latest ? latest.replicas.includes(replica) : false,
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      objectCount: acc.objectCount + 1,
      totalSizeBytes: acc.totalSizeBytes + r.sizeBytes,
    }),
    { objectCount: 0, totalSizeBytes: 0 },
  );

  return {
    lastSuccessfulBackupAt,
    freshness: lastSuccessfulBackupAt ? freshnessFor(lastSuccessfulBackupAt, now) : "error",
    // No quarterly restore drill has run yet — deliberately null, not a fixture bug.
    lastVerifiedRestoreAt: null,
    nextScheduledRunAt: nextScheduledRunAfter(now),
    replicaStatus,
    totals,
    freeTierLimits: FREE_TIER_LIMITS,
  };
}

const ACTIVITY_ACTORS = ["github-actions[bot]", "admin@ithacarecovery.org"];

/** Recent Activity fixture, shaped like `GET /repos/.../actions/workflows/backup-db.yml/runs`. */
export function generateMockActivityEvents(now: Date, count = 10): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let cursor = latestCronSlotAtOrBefore(now);
  for (let i = 0; i < count; i += 1) {
    const isManual = i === 2;
    const trigger: ActivityTrigger = isManual ? "workflow_dispatch" : "schedule";
    // One deterministic failure in the middle of the window so the empty/degraded state is
    // exercised without every row reading as uniformly healthy.
    const conclusion: ActivityConclusion = i === 4 ? "failure" : "success";
    events.push({
      id: `run-${formatArtifactTimestamp(cursor)}`,
      trigger,
      actor: isManual ? ACTIVITY_ACTORS[1] : ACTIVITY_ACTORS[0],
      conclusion,
      startedAt: cursor.toISOString(),
      durationSeconds: Math.round(40 + seededFraction(i + 500) * 90),
      reason: isManual ? "Pre-deploy safety snapshot" : null,
    });
    cursor = stepBackOneCronSlot(cursor);
  }
  return events;
}

// Mirrors the backup feature's meta.json sidecar (see
// ithaca-recovery-backup-feature-plan.md) plus the response shapes the Backups admin tab
// consumes. UI-only in this PR — shapes are consumed by mockBackups.ts today and by the
// real /api/admin/backups* routes in the follow-up PR, so keep them in lockstep with the
// sidecar the backup workflow actually writes, not with the older design brief wording.

/** GFS retention tier. Only three tiers exist — no weekly, no yearly. */
export type BackupTier = "daily" | "monthly" | "permanent";

/** Snapshots table filter chip value — the three GFS tiers plus "all" and the "unverified" cross-cut. */
export type BackupTierFilter = "all" | BackupTier | "unverified";

/** How a backup run was triggered. */
export type BackupSource = "automatic" | "manual";

/** Verification is always structural today (schema/row-count checks in a scratch container). */
export type VerificationMode = "structural";

/**
 * Shape of the `<id>.meta.json` sidecar written next to every `.dump.age` artifact.
 * INVARIANT: no `replicas` field here — a sidecar is written before upload to any storage
 * target, so it cannot honestly claim replica presence. Replica presence is computed
 * server-side from per-target listings and lives on {@link BackupListRow} instead.
 */
export interface BackupMeta {
  id: string;
  createdAt: string;
  tier: BackupTier;
  source: BackupSource;
  triggeredBy: string | null;
  reason: string | null;
  sizeBytes: number;
  sha256: string;
  pgVersion: string;
  appVersion: string;
  gitSha: string;
  ageRecipients: [string, string];
  rowCounts: Record<string, number>;
  verified: boolean;
  verificationMode: VerificationMode;
  verifiedAt: string | null;
}

/** One of the three storage targets a backup artifact is replicated to. */
export type BackupReplica = "gcs-working" | "gcs-archive" | "r2";

/** All three replica targets, in the order the Snapshots table displays them. */
export const ALL_BACKUP_REPLICAS: readonly BackupReplica[] = ["gcs-working", "gcs-archive", "r2"];

/**
 * One row of the Snapshots table: the sidecar plus server-computed fields that can't live
 * in the sidecar itself (replica presence, derived expiry).
 */
export interface BackupListRow extends BackupMeta {
  /** Which of the three storage targets currently hold this artifact's object. */
  replicas: BackupReplica[];
  /** ISO timestamp this row is eligible for GFS deletion, or null for the permanent tier. */
  expiresAt: string | null;
}

export interface BackupListResponse {
  rows: BackupListRow[];
  total: number;
}

/** Freshness state of the most recent successful backup, thresholded off its age. */
export type BackupFreshness = "ok" | "warn" | "error";

export interface BackupReplicaStatus {
  replica: BackupReplica;
  /** Object count currently visible in this target's listing. */
  objectCount: number;
  /** True if the most recent backup row is present in this target. */
  hasLatest: boolean;
}

export interface BackupHealth {
  lastSuccessfulBackupAt: string | null;
  freshness: BackupFreshness;
  /** Null until a quarterly restore drill has actually run once. */
  lastVerifiedRestoreAt: string | null;
  /** Next cron fire time, derived from `17 1,7,13,19 * * *` (UTC). */
  nextScheduledRunAt: string;
  replicaStatus: BackupReplicaStatus[];
  totals: {
    objectCount: number;
    totalSizeBytes: number;
  };
  /** Free-tier ceilings the totals above are measured against, for headroom display. */
  freeTierLimits: {
    gcsWorkingBytes: number;
    gcsArchiveBytes: number;
    r2Bytes: number;
  };
}

/** How a `backup-db.yml` run was triggered — mirrors the GitHub Actions runs API. */
export type ActivityTrigger = "schedule" | "workflow_dispatch";

export type ActivityConclusion = "success" | "failure" | "in_progress";

/** One row of the Recent Activity card, shaped like a GitHub Actions workflow run. */
export interface ActivityEvent {
  id: string;
  trigger: ActivityTrigger;
  actor: string;
  conclusion: ActivityConclusion;
  startedAt: string;
  durationSeconds: number;
  reason: string | null;
}

export interface ActivityListResponse {
  events: ActivityEvent[];
}

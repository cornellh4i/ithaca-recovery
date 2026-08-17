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

/**
 * `backup-db.sh` writes the sidecar's own `id` field as the bare UTC timestamp (e.g.
 * `20260816T143457Z`) but names the artifact files `backup-<id>.dump.age` /
 * `backup-<id>.meta.json`. Mock fixtures instead set `id` to the already-prefixed
 * `backup-<timestamp>` form. This normalizes either shape to the artifact basename (sans
 * extension) so server storage code and client display code agree on the real filename.
 */
export function backupArtifactBaseName(id: string): string {
  return id.startsWith("backup-") ? id : `backup-${id}`;
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

/**
 * Shape of `drill-verified.json`, written to the working bucket root by
 * `restore-drill.sh`'s final step once every check (decrypt, scratch restore, exact
 * count(*) match) has passed. No key material or operator PII — only the artifact it
 * verified, when, and which key holder ran it.
 */
export interface DrillVerifiedMarker {
  verifiedAt: string;
  /** Bare timestamp id (see {@link backupArtifactBaseName}), not the `backup-` prefixed form. */
  artifactId: string;
  keyUsed: "A" | "B";
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
  /** Which `age` key holder ran the most recent verified drill; null alongside a null date. */
  lastVerifiedRestoreKey: "A" | "B" | null;
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

/**
 * Data-source mode every /api/admin/backups* route reports. "live" = real storage/GitHub
 * listings; "mock" = deterministic fixtures served because backup credentials are absent
 * outside production (dev + CI). In production, absent credentials are a 503, never mock.
 */
export type BackupsDataMode = "live" | "mock";

/** Envelope every backups read route wraps its payload in, so the tab can badge mock mode. */
export interface BackupsEnvelope<T> {
  mode: BackupsDataMode;
  data: T;
}

/** 503 body when backup credentials are missing in production. */
export interface BackupsUnconfiguredResponse {
  configured: false;
  /** Names of the missing env vars, so the error is actionable from the tab itself. */
  missing: string[];
}

/** Response of POST /api/admin/backups (workflow_dispatch). */
export interface BackupDispatchResponse {
  mode: BackupsDataMode;
  dispatched: true;
  /** Actor recorded for the optimistic client lock (the caller's own email). */
  triggeredBy: string;
}

/** Response of GET /api/admin/backups/:id/download. Null url in mock mode. */
export interface BackupDownloadResponse {
  mode: BackupsDataMode;
  url: string | null;
  /** Seconds the signed URL stays valid (300 for live V4 URLs). */
  expiresInSeconds: number | null;
}

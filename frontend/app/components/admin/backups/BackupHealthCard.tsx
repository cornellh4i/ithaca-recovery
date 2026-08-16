"use client";

import React from "react";
import Icon from "../../ui/displays/Icon";
import Card from "../shared/Card";
import type { BackupHealth, BackupReplica } from "../../../../types/backups";
import { convertUTCToET } from "../../../../util/date/timeUtils";
import styles from "./BackupsTab.module.scss";

interface BackupHealthCardProps {
  health: BackupHealth;
  /** Reference instant for relative-age labels -- passed in, never read from Date.now() here. */
  now: Date;
}

const REPLICA_LABEL: Record<BackupReplica, string> = {
  "gcs-working": "GCS (working)",
  "gcs-archive": "GCS (archive)",
  r2: "Cloudflare R2",
};

const FRESHNESS_LABEL: Record<BackupHealth["freshness"], string> = {
  ok: "Healthy",
  warn: "Aging",
  error: "Stale",
};

const freshnessPillClass: Record<BackupHealth["freshness"], string> = {
  ok: styles.freshnessOk,
  warn: styles.freshnessWarn,
  error: styles.freshnessError,
};

// Coarse relative age ("3h ago", "2d ago") -- getTime() diffs against the passed-in `now`
// only, no Date.now() (would mismatch between server render and client hydration) and no
// local-timezone Date accessors (banned by the repo's ESLint rule).
const formatRelativeAge = (sinceIso: string, now: Date): string => {
  const diffMs = Math.max(0, now.getTime() - new Date(sinceIso).getTime());
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
};

// Headroom bar switches to warn/error fill once usage crosses these fractions of the free-tier
// ceiling -- matches the freshness pill's own two-threshold shape for visual consistency.
const HEADROOM_WARN_FRACTION = 0.7;
const HEADROOM_ERROR_FRACTION = 0.9;

const headroomFillClass = (fraction: number): string => {
  if (fraction >= HEADROOM_ERROR_FRACTION) return `${styles.headroomFill} ${styles.headroomFillError}`;
  if (fraction >= HEADROOM_WARN_FRACTION) return `${styles.headroomFill} ${styles.headroomFillWarn}`;
  return styles.headroomFill;
};

const BackupHealthCard: React.FC<BackupHealthCardProps> = ({ health, now }) => {
  // Free-tier headroom is measured against the tightest of the three storage ceilings -- a
  // single-bar summary can't represent three independent limits, and the tightest one is the
  // one that will actually block a write first.
  const tightestLimitBytes = Math.min(
    health.freeTierLimits.gcsWorkingBytes,
    health.freeTierLimits.gcsArchiveBytes,
    health.freeTierLimits.r2Bytes,
  );
  const headroomFraction = tightestLimitBytes > 0
    ? Math.min(1, health.totals.totalSizeBytes / tightestLimitBytes)
    : 0;

  return (
    <Card accent="systemStatus">
      <div className={styles.panelHeader}>
        <Icon name="backup" className={styles.panelIcon} />
        Backup Health
      </div>

      <div className={styles.healthGrid}>
        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>Last successful backup</span>
          <span className={styles.healthValue}>
            {health.lastSuccessfulBackupAt ? (
              <>
                {formatRelativeAge(health.lastSuccessfulBackupAt, now)}
                {" "}
                <span className={`${styles.freshnessPill} ${freshnessPillClass[health.freshness]}`}>
                  {FRESHNESS_LABEL[health.freshness]}
                </span>
              </>
            ) : (
              <span className={styles.emptyState}>No successful backup yet</span>
            )}
          </span>
        </div>

        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>Last verified restore</span>
          <span className={styles.healthValue}>
            {health.lastVerifiedRestoreAt
              ? `${formatRelativeAge(health.lastVerifiedRestoreAt, now)} (${convertUTCToET(health.lastVerifiedRestoreAt)} ET)`
              : "Never — quarterly drill pending"}
          </span>
        </div>

        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>Next scheduled run</span>
          <span className={styles.healthValue}>{convertUTCToET(health.nextScheduledRunAt)} ET</span>
        </div>

        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>Replica status</span>
          <div className={`${styles.healthValue} ${styles.replicaStatusList}`}>
            {health.replicaStatus.map((status) => (
              <div key={status.replica} className={styles.replicaStatusRow}>
                <span className={styles.replicaStatusName}>{REPLICA_LABEL[status.replica]}</span>
                <span>
                  {status.hasLatest ? "Latest present" : "Missing latest"} · {status.objectCount} objects
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>Storage vs. free tier</span>
          <span className={styles.healthValue}>
            {formatBytes(health.totals.totalSizeBytes)} · {health.totals.objectCount} objects
          </span>
        </div>
      </div>

      <div className={styles.headroomBar}>
        <div className={headroomFillClass(headroomFraction)} style={{ width: `${headroomFraction * 100}%` }} />
      </div>
      <div className={styles.headroomCaption}>
        {formatBytes(health.totals.totalSizeBytes)} of {formatBytes(tightestLimitBytes)} free-tier headroom used
        (tightest of the three storage targets)
      </div>
    </Card>
  );
};

export default BackupHealthCard;

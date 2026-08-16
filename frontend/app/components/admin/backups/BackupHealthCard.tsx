"use client";

import React from "react";
import Icon from "../../ui/displays/Icon";
import Card from "../shared/Card";
import type { BackupHealth, BackupReplica } from "../../../../types/backups";
import { formatETTime } from "../../../../util/date/timeUtils";
import { formatBytes } from "../../../../util/format/bytes";
import styles from "./BackupsTab.module.scss";

interface BackupHealthCardProps {
  health: BackupHealth;
  /** Reference instant for relative-age labels -- passed in, never read from Date.now() here. */
  now: Date;
}

const REPLICA_LABEL: Record<BackupReplica, string> = {
  "gcs-working": "GCS working",
  "gcs-archive": "GCS archive",
  r2: "Cloudflare R2",
};

// Coarse relative age ("9m ago", "3h ago") -- getTime() diffs against the passed-in `now`
// only, no Date.now() (would mismatch between server render and client hydration) and no
// local-timezone Date accessors (banned by the repo's ESLint rule).
const formatRelativeAge = (sinceIso: string, now: Date): string => {
  const diffMs = Math.max(0, now.getTime() - new Date(sinceIso).getTime());
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) return diffMinutes <= 0 ? "just now" : `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

// Countdown to the next scheduled run ("in 5h 51m"; "in 12m" once under an hour).
const formatCountdown = (untilIso: string, now: Date): string => {
  const diffMs = Math.max(0, new Date(untilIso).getTime() - now.getTime());
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours === 0) return `in ${minutes}m`;
  return `in ${hours}h ${minutes}m`;
};

// Headroom bar switches to warn/error fill once REMAINING capacity drops below these
// fractions of the free-tier ceiling (i.e. usage crosses 70%/90%) -- matches the old
// pill's two-threshold shape for visual consistency.
const HEADROOM_WARN_USED_FRACTION = 0.7;
const HEADROOM_ERROR_USED_FRACTION = 0.9;

const headroomFillClass = (usedFraction: number): string => {
  if (usedFraction >= HEADROOM_ERROR_USED_FRACTION) return `${styles.headroomFill} ${styles.headroomFillError}`;
  if (usedFraction >= HEADROOM_WARN_USED_FRACTION) return `${styles.headroomFill} ${styles.headroomFillWarn}`;
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
  const usedFraction = tightestLimitBytes > 0
    ? Math.min(1, health.totals.totalSizeBytes / tightestLimitBytes)
    : 0;
  const remainingFraction = 1 - usedFraction;
  const remainingBytes = Math.max(0, tightestLimitBytes - health.totals.totalSizeBytes);

  const latestCount = health.replicaStatus.filter((s) => s.hasLatest).length;
  const replicasSummary = latestCount === health.replicaStatus.length
    ? "All three hold the latest snapshot"
    : `${latestCount} of ${health.replicaStatus.length} hold the latest snapshot`;

  return (
    <Card accent="systemStatus">
      <div className={styles.panelHeader}>
        <Icon name="backup" className={styles.panelIcon} />
        Backup Health
      </div>

      {health.lastVerifiedRestoreAt === null && (
        <div className={styles.warningBanner}>
          <div className={styles.warningBannerIcon}>
            <Icon name="warning-amber" />
          </div>
          <div className={styles.warningBannerBody}>
            <p className={styles.warningBannerTitle}>No restore has ever been verified</p>
            <p className={styles.warningBannerText}>
              Backups are running, but an untested backup is an unproven one. The quarterly restore drill is pending.
            </p>
          </div>
          <a className={styles.warningBannerAction} href="/docs/02-handoff/backups-and-recovery">
            Restore drill runbook
          </a>
        </div>
      )}

      <div className={styles.statRow}>
        <div className={styles.statCell}>
          <div
            className={`${styles.statValue} ${
              health.freshness === "error"
                ? styles.statValueError
                : health.freshness === "warn"
                  ? styles.statValueWarn
                  : ""
            }`}
          >
            {health.lastSuccessfulBackupAt ? formatRelativeAge(health.lastSuccessfulBackupAt, now) : "None yet"}
          </div>
          <div className={styles.statCaption}>Last successful backup</div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.statValue}>{formatCountdown(health.nextScheduledRunAt, now)}</div>
          <div className={styles.statCaption}>
            Next run · {formatETTime(new Date(health.nextScheduledRunAt))} ET
          </div>
        </div>
        <div className={styles.statCell}>
          <div className={styles.statValue}>{health.totals.objectCount}</div>
          <div className={styles.statCaption}>Snapshots retained</div>
        </div>
      </div>

      <div className={styles.replicasPanel}>
        <div className={styles.replicasHeader}>
          <span className={styles.replicasLabel}>REPLICAS</span>
          <span className={styles.replicasSummary}>{replicasSummary}</span>
        </div>

        <div className={styles.replicaTiles}>
          {health.replicaStatus.map((status) => (
            <div key={status.replica} className={styles.replicaTile}>
              <span className={styles.replicaTileName}>
                <span
                  className={`${styles.replicaTileDot} ${status.hasLatest ? styles.replicaTileDotOk : styles.replicaTileDotStale}`}
                />
                {REPLICA_LABEL[status.replica]}
              </span>
              <span className={styles.replicaTileCaption}>
                {status.objectCount} objects · {status.hasLatest ? "current" : "stale"}
              </span>
            </div>
          ))}
        </div>

        <div>
          <div className={styles.headroomRow}>
            <span className={styles.headroomLabel}>Free-tier headroom</span>
            <span className={styles.headroomRemaining}>
              {formatBytes(remainingBytes)} of {formatBytes(tightestLimitBytes)} left
            </span>
          </div>
          <div className={styles.headroomBar}>
            <div className={headroomFillClass(usedFraction)} style={{ width: `${remainingFraction * 100}%` }} />
          </div>
          <div className={styles.headroomCaption}>
            {formatBytes(health.totals.totalSizeBytes)} used across {health.totals.objectCount} objects, measured
            on the tightest of the three storage targets.
          </div>
        </div>
      </div>
    </Card>
  );
};

export default BackupHealthCard;

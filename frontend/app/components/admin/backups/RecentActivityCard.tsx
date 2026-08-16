"use client";

import React from "react";
import Card from "../shared/Card";
import Icon from "../../ui/displays/Icon";
import { ActivityConclusion, ActivityEvent } from "../../../../types/backups";
import styles from "./BackupsTab.module.scss";

interface RecentActivityCardProps {
  events: ActivityEvent[];
  /** Reference instant for relative-time labels -- passed in, never read from Date.now() here. */
  now: Date;
}

const CONCLUSION_DOT_CLASS: Record<ActivityConclusion, string> = {
  success: styles.activityConclusionSuccess,
  failure: styles.activityConclusionFailure,
  in_progress: styles.activityConclusionInProgress,
};

const CONCLUSION_LABEL: Record<ActivityConclusion, string> = {
  success: "succeeded",
  failure: "failed",
  in_progress: "in progress",
};

// GitHub Actions run history IS the audit log for this feature (no separate audit table --
// see the backups admin tab plan, Part 1). This card is purely presentational: F7 owns the
// fetch and passes rows shaped like `GET .../actions/workflows/backup-db.yml/runs`.
const RecentActivityCard: React.FC<RecentActivityCardProps> = ({ events, now }) => (
  <Card data-testid="backups-recent-activity-panel">
    <div className={styles.panelHeader}>
      <Icon name="clock" className={styles.panelIcon} />
      Recent Activity
    </div>
    {events.length === 0 ? (
      <div className={styles.emptyState}>No backup runs recorded yet.</div>
    ) : (
      <ul className={styles.activityList}>
        {events.map((event) => (
          <li key={event.id} className={styles.activityRow}>
            <span
              className={`${styles.activityConclusionDot} ${CONCLUSION_DOT_CLASS[event.conclusion]}`}
              aria-hidden="true"
            />
            <div className={styles.activityBody}>
              <div className={styles.activityTitle}>
                {activityTitle(event)}{" "}
                <span className={styles.activityTriggerBadge}>{event.trigger === "schedule" ? "Scheduled" : "Manual"}</span>
              </div>
              <div className={styles.activityMeta}>
                {event.actor} · {formatRelativeTime(event.startedAt, now)} · {formatDuration(event.durationSeconds)}
                {" · "}
                {CONCLUSION_LABEL[event.conclusion]}
              </div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

// "Scheduled backup" for cron-triggered runs, "Manual backup — <reason>" for workflow_dispatch
// runs that carried an operator-supplied reason (see BackupMeta.reason in types/backups.ts).
const activityTitle = (event: ActivityEvent): string => {
  const base = event.trigger === "schedule" ? "Scheduled backup" : "Manual backup";
  return event.trigger === "workflow_dispatch" && event.reason ? `${base} — ${event.reason}` : base;
};

// Coarse relative time (minutes/hours/days) -- getTime() diffs against the passed-in `now`
// only, no Date.now() (would mismatch between server render and client hydration) and no
// local-timezone Date accessors (banned by the repo's ESLint rule).
const formatRelativeTime = (isoTimestamp: string, now: Date): string => {
  const deltaMs = now.getTime() - new Date(isoTimestamp).getTime();
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
};

const formatDuration = (durationSeconds: number): string => {
  if (durationSeconds < 60) return `${durationSeconds}s`;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};

export default RecentActivityCard;

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
  /** Missing GitHub env var names when GET /activity 503s independently of storage -- the rest
   * of the tab still renders since GitHub credentials aren't the storage backbone. Null/absent
   * when activity data loaded normally. */
  unavailable?: string[] | null;
}

const CONCLUSION_LABEL: Record<ActivityConclusion, string> = {
  success: "succeeded",
  failure: "failed",
  in_progress: "in progress",
};

// Only the exceptional rows earn a place here: failures, manual runs, and in-flight runs.
// Routine scheduled successes are summarized as a count instead (see activitySummaryLine).
const isNotable = (event: ActivityEvent): boolean =>
  event.conclusion === "failure" || event.trigger === "workflow_dispatch" || event.conclusion === "in_progress";

/** Count of routine (non-manual, successful) runs -- the "N routine runs succeeded" summary line. */
const countRoutineSuccesses = (events: ActivityEvent[]): number =>
  events.filter((e) => e.trigger === "schedule" && e.conclusion === "success").length;

// GitHub Actions run history IS the audit log for this feature (no separate audit table --
// see the backups admin tab plan, Part 1). This card is purely presentational: F7 owns the
// fetch and passes rows shaped like `GET .../actions/workflows/backup-db.yml/runs`.
const RecentActivityCard: React.FC<RecentActivityCardProps> = ({ events, now, unavailable }) => {
  const notableEvents = events.filter(isNotable);
  const routineSuccessCount = countRoutineSuccesses(events);

  return (
    <Card accent="syncIssues" data-testid="backups-recent-activity-panel">
      <div className={styles.panelHeader}>
        <Icon name="clock" className={styles.panelIcon} />
        Notable Activity
      </div>
      {unavailable && unavailable.length > 0 ? (
        <div className={styles.emptyState}>
          GitHub credentials not configured — run history unavailable. Missing: {unavailable.join(", ")}.
        </div>
      ) : (
        <>
          <div className={styles.activitySummaryLine}>
            Failures, manual runs, and runs in progress.
            {routineSuccessCount > 0 && ` ${routineSuccessCount} routine scheduled successes not shown.`}
          </div>
          {/* TODO(backups-api): link to a full-history view once the API wiring lands. */}
          {notableEvents.length === 0 ? (
            <div className={styles.emptyState}>No failures, manual runs, or runs in progress recorded.</div>
          ) : (
            <ul className={styles.activityList}>
              {notableEvents.map((event) => (
                <li key={event.id} className={styles.activityRow}>
                  <span
                    className={`${styles.activityDot} ${event.conclusion === "failure" ? styles.activityDotFailure : styles.activityDotNeutral}`}
                    aria-hidden="true"
                  />
                  <div className={styles.activityBody}>
                    <div className={`${styles.activityTitle} ${event.conclusion === "failure" ? styles.activityTitleFailure : ""}`}>
                      {activityTitle(event)}
                    </div>
                    <div className={styles.activityMeta}>{activityMeta(event, now)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
};

const activityTitle = (event: ActivityEvent): string => {
  if (event.conclusion === "in_progress") return "Backup in progress";
  if (event.trigger === "workflow_dispatch") {
    return event.reason ? `Manual backup — ${event.reason}` : "Manual backup";
  }
  return "Scheduled backup failed";
};

const activityMeta = (event: ActivityEvent, now: Date): string => {
  const parts = [event.actor, formatRelativeOrAbsoluteTime(event.startedAt, now)];
  if (event.conclusion !== "in_progress") {
    parts.push(`ran ${formatDuration(event.durationSeconds)}`);
  }
  parts.push(CONCLUSION_LABEL[event.conclusion]);
  return parts.join(" · ");
};

// Coarse relative time under 24h; absolute Eastern-time timestamp beyond that -- getTime()
// diffs against the passed-in `now` only, no Date.now() (would mismatch between server render
// and client hydration) and no local-timezone Date accessors (banned by the repo's ESLint rule).
const formatRelativeOrAbsoluteTime = (isoTimestamp: string, now: Date): string => {
  const startedAt = new Date(isoTimestamp);
  const deltaMs = now.getTime() - startedAt.getTime();
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (deltaMinutes < 60) return deltaMinutes < 1 ? "just now" : `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(startedAt)} ET`;
};

const formatDuration = (durationSeconds: number): string => {
  if (durationSeconds < 60) return `${durationSeconds}s`;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};

export default RecentActivityCard;

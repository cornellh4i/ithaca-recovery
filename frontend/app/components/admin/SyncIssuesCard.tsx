"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "./Card";
import TopLoadingBar from "../atoms/TopLoadingBar";
import { retryMeetingSync } from "../../../util/syncMeeting";
import styles from "../../../styles/components/admin/DiagnosticsTab.module.scss";

interface SyncIssueRow {
  mid: string;
  title: string;
  group: string;
  room: string;
  modeType: string;
  calType: string[];
  issues: string[];
  updatedAt: string | null;
}

const SyncIssuesCard: React.FC = () => {
  const [syncIssues, setSyncIssues] = useState<SyncIssueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which row's "Retry sync" is in flight, so only that row shows "Retrying…" instead of
  // every row disabling at once.
  const [retryingMid, setRetryingMid] = useState<string | null>(null);
  // Guards against out-of-order resolution: retrying two different rows back-to-back fires two
  // independent load() calls, so a slower first retry's response could otherwise land after (and
  // clobber) a faster second retry's fresher one.
  const latestRequestId = useRef(0);

  const load = async () => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/diagnostics/sync-issues");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: { syncIssues: SyncIssueRow[] } = await response.json();
      if (requestId === latestRequestId.current) {
        setSyncIssues(json.syncIssues);
        setError(null);
      }
    } catch (err) {
      console.error("Error fetching sync issues:", err);
      if (requestId === latestRequestId.current) setError("Failed to load sync issues.");
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // Same endpoint/shape as ViewMeeting.tsx's "Retry sync" button -- reused here so a row can
  // be retried without navigating to the meeting's own detail view first. Only reloads this
  // card, not the other Diagnostics panels.
  const retrySync = async (mid: string) => {
    setRetryingMid(mid);
    try {
      await retryMeetingSync(mid);
      await load();
    } catch (err) {
      console.error("Error retrying sync:", err);
    } finally {
      // Only clear if this is still the row that started this retry -- a second row's retry
      // starting before this one resolves must not un-disable/mislabel it early.
      setRetryingMid((current) => (current === mid ? null : current));
    }
  };

  if (error) return <Card accent="syncIssues" data-testid="diagnostics-sync-issues-panel">{error}</Card>;
  if (!syncIssues) {
    return (
      <Card accent="syncIssues" data-testid="diagnostics-sync-issues-panel">
        <TopLoadingBar active={loading} />
        Loading sync issues…
      </Card>
    );
  }

  return (
    <Card accent="syncIssues" data-testid="diagnostics-sync-issues-panel">
      <TopLoadingBar active={loading} />
      <div className={styles.panelHeader}>
        <span className={`${styles.panelIcon} ${styles.panelIconSyncIssues}`} />
        Sync Issues ({syncIssues.length})
      </div>
      <div className={styles.panelSubhead}>
        Meetings that failed to sync to Zoom or Google Calendar, or are waiting on a Zoom host to
        become available. Retry here, or open the meeting to edit it if retrying doesn&apos;t resolve it.
      </div>
      {syncIssues.length === 0 ? (
        <div className={styles.emptyState}>No sync issues.</div>
      ) : (
        syncIssues.map((meeting) => (
          <div key={meeting.mid} className={styles.meetingRow}>
            <div className={styles.syncIssueRow}>
              <div>
                <span className={styles.meetingTitle}>{meeting.title}</span>{" "}
                <span className={styles.meetingTags}>({meeting.group})</span>
                <div className={styles.meetingMeta}>
                  {meeting.room} · {meeting.modeType} · {meeting.calType.join(", ")}
                </div>
                {meeting.issues.map((issue) => (
                  <div key={issue} className={styles.issueLine}>{issue}</div>
                ))}
              </div>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => retrySync(meeting.mid)}
                disabled={retryingMid === meeting.mid}
              >
                {retryingMid === meeting.mid ? "Retrying…" : "Retry sync"}
              </button>
            </div>
          </div>
        ))
      )}
    </Card>
  );
};

export default SyncIssuesCard;

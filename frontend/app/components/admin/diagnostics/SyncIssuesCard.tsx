"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "../shared/Card";
import TopLoadingBar from "../../atoms/TopLoadingBar";
import EditMeetingSidebar from "../../meeting-form/EditMeeting";
import { IMeeting } from "../../../../util/models";
import { retryMeetingSync } from "../../../../util/syncMeeting";
import styles from "../../../../styles/components/admin/DiagnosticsTab.module.scss";
// Reuses ConflictList's inline-edit-panel styling (accordion expand + card treatment) rather
// than duplicating it -- same pattern, same visual language, this card just isn't grouped by
// resource so it doesn't need ConflictList's own grouping/rendering logic.
import editStyles from "../../../../styles/components/admin/ConflictList.module.scss";

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
  // Which row's inline edit panel is open, if any -- same pattern as ConflictList.tsx, so a
  // stuck sync (e.g. a pool-exhausted Zoom host) can be fixed by editing the meeting directly
  // rather than only retrying the same failing sync.
  const [expandedMid, setExpandedMid] = useState<string | null>(null);
  const [meetingCache, setMeetingCache] = useState<Record<string, IMeeting>>({});
  const [loadingMid, setLoadingMid] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  const collapseEdit = () => {
    setExpandedMid(null);
    setFetchError(null);
  };

  const fetchMeeting = async (mid: string) => {
    setLoadingMid(mid);
    setFetchError(null);
    try {
      const response = await fetch(`/api/retrieve/meeting/${mid}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: IMeeting = await response.json();
      setMeetingCache((prev) => ({ ...prev, [mid]: data }));
    } catch (err) {
      console.error("Error fetching meeting details:", err);
      setFetchError("Failed to load meeting details. Please try again.");
    } finally {
      setLoadingMid(null);
    }
  };

  const toggleEdit = (mid: string) => {
    if (expandedMid === mid) {
      collapseEdit();
      return;
    }
    setExpandedMid(mid);
    setFetchError(null);
    if (meetingCache[mid]) return;
    fetchMeeting(mid);
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
        Failed to sync, or waiting on a Zoom host. Retry here; edit the meeting if that doesn&apos;t resolve it.
      </div>
      {syncIssues.length === 0 ? (
        <div className={styles.emptyState}>No sync issues.</div>
      ) : (
        <div className={styles.meetingListBox}>
        {syncIssues.map((meeting) => {
          const isExpanded = expandedMid === meeting.mid;
          const meetingDetails = meetingCache[meeting.mid];
          return (
            <div key={meeting.mid} className={styles.meetingRow}>
              <div className={styles.syncIssueRow}>
                <div>
                  <span className={styles.meetingTitle}>{meeting.title}</span>{" "}
                  <span className={styles.meetingTags}>({meeting.group})</span>
                  <div className={styles.meetingMeta}>
                    {meeting.room} · {meeting.modeType} · {meeting.calType.join(", ")}
                  </div>
                  {meeting.issues.map((issue) => (
                    <div
                      key={issue}
                      className={`${styles.issueLine} ${issue.startsWith("Waiting on a Zoom host") ? styles.warningText : styles.dangerText}`}
                    >
                      {issue}
                    </div>
                  ))}
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => retrySync(meeting.mid)}
                    disabled={retryingMid === meeting.mid}
                  >
                    {retryingMid === meeting.mid ? "Retrying…" : "Retry sync"}
                  </button>
                  <button
                    type="button"
                    className={styles.retryButton}
                    aria-expanded={isExpanded}
                    onClick={() => toggleEdit(meeting.mid)}
                  >
                    {isExpanded ? "Close" : "Edit"}
                  </button>
                </div>
              </div>
              <div className={`${editStyles.editPanel} ${isExpanded ? editStyles.editPanelOpen : ""}`}>
                <div className={editStyles.editPanelInner}>
                  {isExpanded && (
                    loadingMid === meeting.mid ? (
                      <div className={editStyles.editLoading}>Loading meeting…</div>
                    ) : fetchError && !meetingDetails ? (
                      <div className={editStyles.editLoading}>
                        {fetchError}{" "}
                        <button type="button" className={styles.retryButton} onClick={() => fetchMeeting(meeting.mid)}>
                          Retry
                        </button>
                      </div>
                    ) : !meetingDetails ? null : (
                      <div className={editStyles.editCard}>
                        <EditMeetingSidebar
                          layout="wide"
                          meeting={meetingDetails}
                          onClose={collapseEdit}
                          onUpdateSuccess={() => {
                            collapseEdit();
                            setMeetingCache((prev) => {
                              const next = { ...prev };
                              delete next[meeting.mid];
                              return next;
                            });
                            load();
                          }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </Card>
  );
};

export default SyncIssuesCard;

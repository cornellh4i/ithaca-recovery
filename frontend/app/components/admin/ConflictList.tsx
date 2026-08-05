"use client";

import React, { useState } from "react";
import EditMeetingSidebar from "../meeting-form/EditMeeting";
import { IMeeting } from "../../../util/models";
import { useZoomHostPool } from "../../../hooks/useZoomHostPool";
import { zoomHostLabel } from "../../../util/zoomHosts";
import {
  ConflictListRow,
  fieldLabel,
  formatOverlapSummary,
  formatMeetingSchedule,
} from "../../../util/conflictDisplay";
import styles from "../../../styles/components/admin/ConflictList.module.scss";

export type { ConflictRecurrenceSummary, ConflictMeetingSummary, ConflictListRow } from "../../../util/conflictDisplay";
export { fieldLabel, formatOverlapSummary, formatMeetingSchedule } from "../../../util/conflictDisplay";

interface ConflictListProps {
  conflicts: ConflictListRow[];
  emptyLabel?: string;
  // Called after a meeting is edited from this list, since the edit may have resolved the
  // conflict (e.g. moved to a different room/time) -- lets the parent refetch.
  onMeetingUpdated?: () => void;
}

// Shared by DiagnosticsTab's Conflicts panel and ImportTab's post-import results — same
// resource-conflict shape (see util/resourceOverlap.ts's ConflictRow), rendered the same way
// in both places so a Super Admin importing meetings sees exactly what Diagnostics would flag.
const ConflictList: React.FC<ConflictListProps> = ({ conflicts, emptyLabel = "No conflicts detected.", onMeetingUpdated }) => {
  // Edit expands inline (below the meeting row) instead of navigating to the Main Calendar,
  // reusing the real EditMeetingSidebar/MeetingForm rather than a deep link to /?mid=...&edit=1.
  // The same meeting can appear in more than one conflict row (e.g. it double-books both a room
  // and a Zoom room), so expandedMid alone isn't enough -- expandedRowIndex pins the form to a
  // single row, and clicking Edit on another row for the same mid just re-anchors it there
  // instead of opening a second, independent copy of the form.
  const [expandedMid, setExpandedMid] = useState<string | null>(null);
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);
  const [meetingCache, setMeetingCache] = useState<Record<string, IMeeting>>({});
  const [loadingMid, setLoadingMid] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Only needed to turn a zoomHost conflict row's raw email into "Zoom Host N — email" (see
  // conflictValueLabel below) -- room/zoomRoom rows don't touch this.
  const hosts = useZoomHostPool();

  const collapse = () => {
    setExpandedMid(null);
    setExpandedRowIndex(null);
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

  const toggleEdit = (rowIndex: number, mid: string) => {
    if (expandedMid === mid && expandedRowIndex === rowIndex) {
      collapse();
      return;
    }
    setExpandedMid(mid);
    setExpandedRowIndex(rowIndex);
    setFetchError(null);
    if (meetingCache[mid]) return;
    fetchMeeting(mid);
  };

  if (conflicts.length === 0) {
    return <div className={styles.emptyState}>{emptyLabel}</div>;
  }

  // A raw zoomHost email means nothing at a glance -- room/zoomRoom values are already
  // human-readable names, so they pass through untouched.
  const conflictValueLabel = (conflict: ConflictListRow): string => {
    if (conflict.field !== "zoomHost") return conflict.value;
    const index = hosts.indexOf(conflict.value);
    const label = zoomHostLabel(conflict.value, index);
    // zoomHostLabel already returns the raw email for index -1 (host not in the current
    // pool, or the pool hasn't loaded yet) -- appending the email again there would render
    // "email — email".
    return index === -1 ? label : `${label} — ${conflict.value}`;
  };

  return (
    <div data-testid="conflict-list">
      {conflicts.map((conflict, i) => (
        <div key={`${conflict.field}-${conflict.value}-${i}`} className={styles.conflictGroup}>
          <div className={styles.conflictMeta}>
            {fieldLabel(conflict.field)}: <span className={styles.conflictValue}>{conflictValueLabel(conflict)}</span>
          </div>
          <div className={styles.overlapSummary}>{formatOverlapSummary(conflict.overlap, conflict.meetings)}</div>
          {conflict.meetings.map((meeting) => {
            const isExpanded = expandedMid === meeting.mid && expandedRowIndex === i;
            const meetingDetails = meetingCache[meeting.mid];
            return (
              <div key={meeting.mid} className={styles.conflictEntry}>
                <div className={styles.conflictRow}>
                  <div>
                    <span className={styles.meetingTitle}>{meeting.title}</span>{" "}
                    {meeting.calType.length > 0 && (
                      <span className={styles.meetingTags}>({meeting.calType.join(", ")})</span>
                    )}
                    <div className={styles.meetingSchedule}>{formatMeetingSchedule(meeting)}</div>
                  </div>
                  <button
                    type="button"
                    className={styles.editButton}
                    aria-expanded={isExpanded}
                    onClick={() => toggleEdit(i, meeting.mid)}
                  >
                    {isExpanded ? "Close" : "Edit"}
                  </button>
                </div>
                <div className={`${styles.editPanel} ${isExpanded ? styles.editPanelOpen : ""}`}>
                  <div className={styles.editPanelInner}>
                    {isExpanded && (
                      loadingMid === meeting.mid ? (
                        <div className={styles.editLoading}>Loading meeting…</div>
                      ) : fetchError && !meetingDetails ? (
                        <div className={styles.editLoading}>
                          {fetchError}{" "}
                          <button type="button" className={styles.editButton} onClick={() => fetchMeeting(meeting.mid)}>
                            Retry
                          </button>
                        </div>
                      ) : !meetingDetails ? null : (
                        <div className={styles.editCard}>
                          <EditMeetingSidebar
                            layout="wide"
                            meeting={meetingDetails}
                            onClose={collapse}
                            onUpdateSuccess={() => {
                              collapse();
                              setMeetingCache((prev) => {
                                const next = { ...prev };
                                delete next[meeting.mid];
                                return next;
                              });
                              onMeetingUpdated?.();
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
      ))}
    </div>
  );
};

export default ConflictList;

"use client";

import React, { useMemo, useState } from "react";
import EditMeetingSidebar from "../../meeting-form/EditMeeting";
import { IMeeting } from "../../../../types/models";
import { useZoomHostPool } from "../../../../hooks/useZoomHostPool";
import { zoomHostLabel } from "../../../../util/rooms/zoomHosts";
import {
  ConflictListRow,
  formatOverlapSummary,
  formatMeetingSchedule,
} from "../../../../util/meetings/conflictDisplay";
import styles from "./ConflictList.module.scss";

export type { ConflictRecurrenceSummary, ConflictMeetingSummary, ConflictListRow } from "../../../../util/meetings/conflictDisplay";
export { fieldLabel, formatOverlapSummary, formatMeetingSchedule } from "../../../../util/meetings/conflictDisplay";

interface ConflictListProps {
  conflicts: ConflictListRow[];
  emptyLabel?: string;
  // Called after a meeting is edited from this list, since the edit may have resolved the
  // conflict (e.g. moved to a different room/time) -- lets the parent refetch.
  onMeetingUpdated?: () => void;
}

// Renders the resource-conflict shape from util/resourceOverlap.ts's ConflictRow;
// used by DiagnosticsTab's Conflicts panel.
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

  // computeConflicts emits one row per overlapping PAIR, so the same room/zoomRoom/zoomHost
  // can appear across several rows when 3+ meetings share it (A-B, A-C, B-C). Group those back
  // into one box per resource -- fieldLabel's raw value is the grouping key (not
  // conflictValueLabel's zoomHost-formatted version, which is derived and only needed at
  // render time). Meetings are deduped by mid (the same meeting can appear in more than one
  // pairwise row); the group's overlap summary spans the earliest start to the latest end
  // across all its rows -- exact for the common 2-meeting case the design was built around,
  // an at-a-glance approximation for the rarer 3+ case. Computed unconditionally (before the
  // conflicts.length === 0 early return below) since it's a hook -- must run on every render.
  const groups = useMemo(() => conflicts.reduce((acc, conflict) => {
    const key = `${conflict.field}::${conflict.value}`;
    const existing = acc.get(key);
    if (!existing) {
      acc.set(key, { field: conflict.field, value: conflict.value, overlap: { ...conflict.overlap }, meetings: [...conflict.meetings] });
      return acc;
    }
    if (new Date(conflict.overlap.start) < new Date(existing.overlap.start)) existing.overlap.start = conflict.overlap.start;
    if (new Date(conflict.overlap.end) > new Date(existing.overlap.end)) existing.overlap.end = conflict.overlap.end;
    for (const meeting of conflict.meetings) {
      if (!existing.meetings.some((m) => m.mid === meeting.mid)) existing.meetings.push(meeting);
    }
    return acc;
  }, new Map<string, { field: ConflictListRow["field"]; value: string; overlap: ConflictListRow["overlap"]; meetings: ConflictListRow["meetings"][number][] }>()), [conflicts]);

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
  // human-readable names, so they pass through untouched. Takes just field/value (not a full
  // ConflictListRow) since that's all it reads -- letting callers pass a group summary that
  // doesn't carry a real 2-tuple meetings array without needing to fake one.
  const conflictValueLabel = (conflict: { field: ConflictListRow["field"]; value: string }): string => {
    if (conflict.field !== "zoomHost") return conflict.value;
    const index = hosts.indexOf(conflict.value);
    const label = zoomHostLabel(conflict.value, index);
    // zoomHostLabel already returns the raw email for index -1 (host not in the current
    // pool, or the pool hasn't loaded yet) -- appending the email again there would render
    // "email — email".
    return index === -1 ? label : `${label} — ${conflict.value}`;
  };

  const resourceTypeLabel = (field: ConflictListRow["field"]): string => {
    if (field === "room") return "Physical";
    if (field === "zoomRoom") return "Zoom Room";
    return "Zoom Host";
  };

  return (
    <div data-testid="conflict-list">
      {Array.from(groups.values()).map((group, i) => (
        <div key={`${group.field}-${group.value}`} className={styles.conflictGroup}>
          <div className={styles.conflictMeta}>
            <span className={styles.conflictValue}>{conflictValueLabel(group)}</span> — {resourceTypeLabel(group.field)}
          </div>
          <div className={styles.overlapSummary}>{formatOverlapSummary(group.overlap, group.meetings)}</div>
          <div className={styles.conflictBox}>
            {group.meetings.map((meeting) => {
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
        </div>
      ))}
    </div>
  );
};

export default ConflictList;

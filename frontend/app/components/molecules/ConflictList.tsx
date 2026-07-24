"use client";

import React, { useState } from "react";
import { formatDayColumn } from "../../../util/recurrenceDisplay";
import { formatCompactTimeRange } from "../../../util/timeFormat";
import EditMeetingSidebar from "../organisms/EditMeeting";
import { IMeeting } from "../../../util/models";
import styles from "../../../styles/components/molecules/ConflictList.module.scss";

export interface ConflictRecurrenceSummary {
  type: string;
  interval: number;
  daysOfWeek: string[];
  weekOfMonth: number | null;
  dayOfMonth: number | null;
}

export interface ConflictMeetingSummary {
  mid: string;
  title: string;
  calType: string[];
  isRecurring: boolean;
  recurrencePattern: ConflictRecurrenceSummary | null;
  // ISO strings -- this meeting's own occurrence, not the overlap intersection.
  occurrence: { start: string; end: string };
}

export interface ConflictListRow {
  field: "room" | "zoomRoom";
  value: string;
  // ISO strings -- Dates don't survive JSON as-is.
  overlap: { start: string; end: string };
  meetings: [ConflictMeetingSummary, ConflictMeetingSummary];
}

interface ConflictListProps {
  conflicts: ConflictListRow[];
  emptyLabel?: string;
  // Called after a meeting is edited from this list, since the edit may have resolved the
  // conflict (e.g. moved to a different room/time) -- lets the parent refetch.
  onMeetingUpdated?: () => void;
}

const fieldLabel = (field: "room" | "zoomRoom"): string => (field === "room" ? "Room" : "Zoom Room");

// Extracts ET wall-clock time as "HH:MM" (24hr), which is what formatCompactTimeRange expects
// -- mirrors ViewMeeting.tsx's etTimeFmt.
const etTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
});

const etWeekday = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date);

const etDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(date);

const compactTimeRange = (start: Date, end: Date): string =>
  formatCompactTimeRange(etTimeFmt.format(start), etTimeFmt.format(end));

// "Overlap: Tue 7-8PM · next occurs Jul 14, 2026" for a recurring pair, or
// "Overlap: Fri 6-7PM (single occurrence) · Sep 12, 2026" when both are one-time.
const formatOverlapSummary = (overlap: ConflictListRow["overlap"], meetings: ConflictListRow["meetings"]): string => {
  const start = new Date(overlap.start);
  const end = new Date(overlap.end);
  const bothOneTime = meetings.every((m) => !m.isRecurring);
  const timeRange = `${etWeekday(start)} ${compactTimeRange(start, end)}`;
  const dateLabel = etDate(start);
  return bothOneTime
    ? `Overlap: ${timeRange} (single occurrence) · ${dateLabel}`
    : `Overlap: ${timeRange} · next occurs ${dateLabel}`;
};

// "Weekly · Tue · 7-8PM", "Monthly · 2nd Fri · 7-8PM", or "One-time meeting · 7-8PM" -- mirrors
// ViewMeeting.tsx's getRecurrenceText, reusing the same Day-column formatter as the XLSX/lease
// exports. The time shown is this meeting's own occurrence, not the overlap window above, since
// the two can differ (e.g. 6-8PM vs. 7-9PM overlapping 7-8PM).
const formatMeetingSchedule = (meeting: ConflictMeetingSummary): string => {
  const { recurrencePattern, occurrence } = meeting;
  const time = compactTimeRange(new Date(occurrence.start), new Date(occurrence.end));
  if (!recurrencePattern) return `One-time meeting · ${time}`;

  const day = formatDayColumn(recurrencePattern);
  if (recurrencePattern.type === "monthly") {
    return `${day ? `Monthly · ${day}` : "Monthly"} · ${time}`;
  }

  let intervalText = "Weekly";
  if (recurrencePattern.interval === 2) intervalText = "Biweekly";
  else if (recurrencePattern.interval === 3) intervalText = "Triweekly";
  else if (recurrencePattern.interval > 1) intervalText = `Every ${recurrencePattern.interval} weeks`;
  return `${day ? `${intervalText} · ${day}` : intervalText} · ${time}`;
};

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

  const collapse = () => {
    setExpandedMid(null);
    setExpandedRowIndex(null);
  };

  const toggleEdit = async (rowIndex: number, mid: string) => {
    if (expandedMid === mid && expandedRowIndex === rowIndex) {
      collapse();
      return;
    }
    setExpandedMid(mid);
    setExpandedRowIndex(rowIndex);
    if (meetingCache[mid]) return;

    setLoadingMid(mid);
    try {
      const response = await fetch(`/api/retrieve/meeting/${mid}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: IMeeting = await response.json();
      setMeetingCache((prev) => ({ ...prev, [mid]: data }));
    } catch (err) {
      console.error("Error fetching meeting details:", err);
      collapse();
    } finally {
      setLoadingMid(null);
    }
  };

  if (conflicts.length === 0) {
    return <div className={styles.emptyState}>{emptyLabel}</div>;
  }

  return (
    <div data-testid="conflict-list">
      {conflicts.map((conflict, i) => (
        <div key={`${conflict.field}-${conflict.value}-${i}`} className={styles.conflictGroup}>
          <div className={styles.conflictMeta}>
            {fieldLabel(conflict.field)}: <span className={styles.conflictValue}>{conflict.value}</span>
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
                      loadingMid === meeting.mid || !meetingDetails ? (
                        <div className={styles.editLoading}>Loading meeting…</div>
                      ) : (
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

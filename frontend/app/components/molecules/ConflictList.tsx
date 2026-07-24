"use client";

import React from "react";
import Link from "next/link";
import { formatDayColumn } from "../../../util/recurrenceDisplay";
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
}

const fieldLabel = (field: "room" | "zoomRoom"): string => (field === "room" ? "Room" : "Zoom Room");

const etTime = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(date);

const etWeekday = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date);

const etDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(date);

// "7:00 PM–8:00 PM", or "7:00–8:00 PM" when both ends share the same AM/PM.
const formatTimeRange = (start: Date, end: Date): string => {
  const startLabel = etTime(start);
  const endLabel = etTime(end);
  const startPeriod = startLabel.slice(-2);
  const endPeriod = endLabel.slice(-2);
  const startTrimmed = startPeriod === endPeriod ? startLabel.slice(0, -3) : startLabel;
  return `${startTrimmed}–${endLabel}`;
};

// "Overlap: Tue 7:00–8:00 PM · next occurs Jul 14, 2026" for a recurring pair, or
// "Overlap: Fri 6:00–7:00 PM (single occurrence) · Sep 12, 2026" when both are one-time.
const formatOverlapSummary = (overlap: ConflictListRow["overlap"], meetings: ConflictListRow["meetings"]): string => {
  const start = new Date(overlap.start);
  const end = new Date(overlap.end);
  const bothOneTime = meetings.every((m) => !m.isRecurring);
  const timeRange = `${etWeekday(start)} ${formatTimeRange(start, end)}`;
  const dateLabel = etDate(start);
  return bothOneTime
    ? `Overlap: ${timeRange} (single occurrence) · ${dateLabel}`
    : `Overlap: ${timeRange} · next occurs ${dateLabel}`;
};

// "Weekly · Tue", "Monthly · 2nd Fri", or "One-time meeting" -- mirrors ViewMeeting.tsx's
// getRecurrenceText, reusing the same Day-column formatter as the XLSX/lease exports.
const formatMeetingSchedule = (meeting: ConflictMeetingSummary): string => {
  const { recurrencePattern } = meeting;
  if (!recurrencePattern) return "One-time meeting";

  const day = formatDayColumn(recurrencePattern);
  if (recurrencePattern.type === "monthly") return day ? `Monthly · ${day}` : "Monthly";

  let intervalText = "Weekly";
  if (recurrencePattern.interval === 2) intervalText = "Biweekly";
  else if (recurrencePattern.interval === 3) intervalText = "Triweekly";
  else if (recurrencePattern.interval > 1) intervalText = `Every ${recurrencePattern.interval} weeks`;
  return day ? `${intervalText} · ${day}` : intervalText;
};

// Shared by DiagnosticsTab's Conflicts panel and ImportTab's post-import results — same
// resource-conflict shape (see util/resourceOverlap.ts's ConflictRow), rendered the same way
// in both places so a Super Admin importing meetings sees exactly what Diagnostics would flag.
const ConflictList: React.FC<ConflictListProps> = ({ conflicts, emptyLabel = "No conflicts detected." }) => {
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
          {conflict.meetings.map((meeting) => (
            <div key={meeting.mid} className={styles.conflictRow}>
              <div>
                <span className={styles.meetingTitle}>{meeting.title}</span>{" "}
                {meeting.calType.length > 0 && (
                  <span className={styles.meetingTags}>({meeting.calType.join(", ")})</span>
                )}
                <div className={styles.meetingSchedule}>{formatMeetingSchedule(meeting)}</div>
              </div>
              <Link href={`/?mid=${meeting.mid}&edit=1`} className={styles.editButton}>
                Edit
              </Link>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default ConflictList;

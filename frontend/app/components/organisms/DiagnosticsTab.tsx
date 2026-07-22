"use client";

import React, { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import StatCounter from "../atoms/StatCounter";
import styles from "../../../styles/components/organisms/DiagnosticsTab.module.scss";

interface DiagnosticsTabProps {
  email: string;
  role: Role;
}

interface DiagnosticsData {
  database: { ok: boolean; latencyMs: number | null };
  googleCalendar: { categories: Record<string, boolean> };
  session: { email: string | null; role: Role | null };
  meetingCounts: {
    total: number;
    active: number;
    suspended: number;
    byCategory: Record<string, number>;
    recurring: number;
    oneTime: number;
  };
  conflicts: unknown[];
  suspendedMeetings: {
    mid: string;
    title: string;
    group: string;
    room: string;
    modeType: string;
    calType: string[];
    updatedAt: string | null;
  }[];
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
};

const DiagnosticsTab: React.FC<DiagnosticsTabProps> = ({ email, role }) => {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/admin/diagnostics");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json: DiagnosticsData = await response.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.error("Error fetching diagnostics:", err);
        if (!cancelled) setError("Failed to load diagnostics.");
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className={styles.card}>{error}</div>;
  if (!data) return <div className={styles.card}>Loading diagnostics…</div>;

  const gcalEntries = Object.entries(data.googleCalendar.categories);
  const gcalReachableCount = gcalEntries.filter(([, ok]) => ok).length;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.sectionLabel}>SYSTEM STATUS</div>

        <div className={styles.statusRow}>
          <span className={`${styles.dot} ${data.database.ok ? styles.dotOk : styles.dotDown}`} />
          <span className={styles.statusLabel}>Database</span>
          <span className={styles.statusDetail}>
            {data.database.ok ? `Connected · ${data.database.latencyMs}ms` : "Unreachable"}
          </span>
        </div>

        <div className={styles.statusRow}>
          <span className={`${styles.dot} ${gcalReachableCount === gcalEntries.length ? styles.dotOk : styles.dotDown}`} />
          <span className={styles.statusLabel}>Google Calendar</span>
          <span className={styles.statusDetail}>
            {gcalReachableCount}/{gcalEntries.length} calendars reachable
          </span>
        </div>
        <div className={styles.gcalSubRow}>
          {gcalEntries.map(([cat, ok]) => (
            <span key={cat} className={ok ? styles.gcalOk : styles.gcalDown}>
              {cat}: {ok ? "✓" : "✕ unreachable"}
            </span>
          ))}
        </div>

        <div className={styles.statusRow}>
          <span className={styles.dot} style={{ backgroundColor: "#4CAF50" }} />
          <span className={styles.statusLabel}>Session</span>
          <span className={styles.statusDetail}>
            Active · {email} — Role: {roleLabel[role] ?? role}
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.sectionLabel}>MEETING COUNTS</div>
        <div className={styles.countsRow}>
          <StatCounter value={data.meetingCounts.total} label="Total" />
          <StatCounter value={data.meetingCounts.active} label="Active" />
          <StatCounter value={data.meetingCounts.suspended} label="Suspended" variant="warning" />
        </div>
        <div className={styles.countsSecondaryRow}>
          <span>
            {Object.entries(data.meetingCounts.byCategory)
              .map(([cat, count]) => `${cat}: ${count}`)
              .join(" · ")}
          </span>
          <span>
            Recurring: {data.meetingCounts.recurring} · One-time: {data.meetingCounts.oneTime}
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.panelHeader}>⚠ Conflicts ({data.conflicts.length})</div>
        <div className={styles.panelSubhead}>
          These meetings share a room or Zoom account at overlapping times. Review and edit one to resolve.
        </div>
        {data.conflicts.length === 0 && (
          <div className={styles.emptyState}>No conflicts detected.</div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.panelHeader}>⏸ Suspended ({data.meetingCounts.suspended})</div>
        <div className={styles.panelSubhead}>
          Meetings currently marked suspended. They're hidden from Google Calendar but remain in the system.
        </div>
        {data.suspendedMeetings.length === 0 ? (
          <div className={styles.emptyState}>No suspended meetings.</div>
        ) : (
          data.suspendedMeetings.map((meeting) => (
            <div key={meeting.mid} className={styles.meetingRow}>
              <div>
                <span className={styles.meetingTitle}>{meeting.title}</span>{" "}
                <span className={styles.meetingTags}>({meeting.group})</span>
              </div>
              <div className={styles.meetingMeta}>
                {meeting.room} · {meeting.modeType} · {meeting.calType.join(", ")}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DiagnosticsTab;

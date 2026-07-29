"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Role } from "@prisma/client";
import StatCounter from "../atoms/StatCounter";
import ConflictList, { ConflictListRow } from "../molecules/ConflictList";
import styles from "../../../styles/components/organisms/DiagnosticsTab.module.scss";

interface DiagnosticsTabProps {
  email: string;
  role: Role;
}

interface DiagnosticsData {
  database: { ok: boolean; latencyMs: number | null };
  googleCalendar: { categories: Record<string, boolean> };
  zoom: {
    reachable: boolean;
    roomCalendars: Record<string, boolean>;
    hostPool: Record<string, { ok: boolean; licensed: boolean | null }>;
  };
  session: { email: string | null; role: Role | null };
  meetingCounts: {
    total: number;
    active: number;
    suspended: number;
    byCategory: Record<string, number>;
    recurring: number;
    oneTime: number;
    gcalSyncErrors: number;
    zoomSyncErrors: number;
    pendingZoomSync: number;
  };
  conflicts: ConflictListRow[];
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
  // Guards against out-of-order resolution: loadDiagnostics is called both on mount and from
  // ConflictList's onMeetingUpdated, so a slow initial fetch could otherwise resolve after (and
  // overwrite) a faster post-edit refresh.
  const latestRequestId = useRef(0);

  const loadDiagnostics = async () => {
    const requestId = ++latestRequestId.current;
    try {
      const response = await fetch("/api/admin/diagnostics");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: DiagnosticsData = await response.json();
      if (requestId === latestRequestId.current) setData(json);
    } catch (err) {
      console.error("Error fetching diagnostics:", err);
      if (requestId === latestRequestId.current) setError("Failed to load diagnostics.");
    }
  };

  useEffect(() => {
    // loadDiagnostics is also called from ConflictList's onMeetingUpdated, so it can't be
    // defined inline inside this effect the way the lint rule expects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDiagnostics();
  }, []);

  if (error) return <div className={styles.card}>{error}</div>;
  if (!data) return <div className={styles.card}>Loading diagnostics…</div>;

  const gcalEntries = Object.entries(data.googleCalendar.categories);
  const gcalReachableCount = gcalEntries.filter(([, ok]) => ok).length;

  const roomCalendarEntries = Object.entries(data.zoom.roomCalendars);
  const roomCalendarOkCount = roomCalendarEntries.filter(([, ok]) => ok).length;

  const hostPoolEntries = Object.entries(data.zoom.hostPool);
  const hostPoolOkCount = hostPoolEntries.filter(([, s]) => s.ok && s.licensed !== false).length;

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
          <span className={`${styles.dot} ${data.zoom.reachable ? styles.dotOk : styles.dotDown}`} />
          <span className={styles.statusLabel}>Zoom</span>
          <span className={styles.statusDetail}>
            {data.zoom.reachable ? "Account reachable" : "Account unreachable"}
            {" · "}{roomCalendarOkCount}/{roomCalendarEntries.length} room calendars reachable
            {" · "}{hostPoolOkCount}/{hostPoolEntries.length} pooled hosts OK
          </span>
        </div>
        <div className={styles.gcalSubRow}>
          {roomCalendarEntries.map(([room, ok]) => (
            <span key={room} className={ok ? styles.gcalOk : styles.gcalDown}>
              {room.replace(/ - Zoom$/, "")}: {ok ? "✓" : "✕ unreachable"}
            </span>
          ))}
        </div>
        <div className={styles.gcalSubRow}>
          {hostPoolEntries.map(([host, s]) => {
            let detail = s.ok ? "✓" : "✕ unreachable";
            if (s.ok && s.licensed === false) detail += " (Basic — 40min cap)";
            return (
              <span key={host} className={s.ok && s.licensed !== false ? styles.gcalOk : styles.gcalDown}>
                {host}: {detail}
              </span>
            );
          })}
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
        {(data.meetingCounts.gcalSyncErrors > 0 || data.meetingCounts.zoomSyncErrors > 0) && (
          <div className={styles.countsSecondaryRow}>
            <span className={styles.gcalDown}>
              ⚠ Sync errors — Google Calendar: {data.meetingCounts.gcalSyncErrors} · Zoom: {data.meetingCounts.zoomSyncErrors}
            </span>
          </div>
        )}
        {data.meetingCounts.pendingZoomSync > 0 && (
          <div className={styles.countsSecondaryRow}>
            <span className={styles.gcalDown}>
              ⏳ Waiting on a Zoom host: {data.meetingCounts.pendingZoomSync} — calendars
              won&apos;t publish until a host becomes available (retry from the meeting&apos;s detail view)
            </span>
          </div>
        )}
      </div>

      <div className={styles.card} data-testid="diagnostics-conflicts-panel">
        <div className={styles.panelHeader}>⚠ Conflicts ({data.conflicts.length})</div>
        <div className={styles.panelSubhead}>
          These meetings share a room or Zoom room at overlapping times. Review and edit one to resolve.
        </div>
        <ConflictList conflicts={data.conflicts} onMeetingUpdated={loadDiagnostics} />
      </div>

      <div className={styles.card} data-testid="diagnostics-suspended-panel">
        <div className={styles.panelHeader}>⏸ Suspended ({data.meetingCounts.suspended})</div>
        <div className={styles.panelSubhead}>
          Meetings currently marked suspended. They&apos;re hidden from Google Calendar but remain in the system.
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

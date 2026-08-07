"use client";

import React, { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import Card from "./Card";
import TopLoadingBar from "../atoms/TopLoadingBar";
import styles from "../../../styles/components/admin/DiagnosticsTab.module.scss";

interface SystemStatusCardProps {
  email: string;
  role: Role;
}

interface SystemStatusData {
  database: { ok: boolean; latencyMs: number | null };
  googleCalendar: { categories: Record<string, boolean> };
  zoom: {
    reachable: boolean;
    roomCalendars: Record<string, boolean>;
    hostPool: Record<string, { ok: boolean; licensed: boolean | null }>;
  };
  session: { email: string | null; role: Role | null };
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
};

const SystemStatusCard: React.FC<SystemStatusCardProps> = ({ email, role }) => {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/diagnostics/system-status");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: SystemStatusData = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error("Error fetching system status:", err);
      setError("Failed to load system status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (error) return <Card>{error}</Card>;
  if (!data) return <Card><TopLoadingBar active={loading} />Loading system status…</Card>;

  const gcalEntries = Object.entries(data.googleCalendar.categories);
  const gcalReachableCount = gcalEntries.filter(([, ok]) => ok).length;

  const roomCalendarEntries = Object.entries(data.zoom.roomCalendars);
  const roomCalendarOkCount = roomCalendarEntries.filter(([, ok]) => ok).length;

  const hostPoolEntries = Object.entries(data.zoom.hostPool);
  const hostPoolReachableCount = hostPoolEntries.filter(([, s]) => s.ok).length;
  // Confirmed Licensed only (licensed === true) -- licensed === null means the check couldn't
  // determine license status (e.g. Zoom unreachable), and counting that alongside a confirmed
  // Licensed host would overstate this line, which reads as a positive claim ("N licensed").
  const hostPoolLicensedCount = hostPoolEntries.filter(([, s]) => s.licensed === true).length;

  return (
    <Card>
      <TopLoadingBar active={loading} />
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
          {" · "}{hostPoolReachableCount}/{hostPoolEntries.length} pooled hosts reachable
          {" · "}{hostPoolLicensedCount}/{hostPoolEntries.length} licensed
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
    </Card>
  );
};

export default SystemStatusCard;

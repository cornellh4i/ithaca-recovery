"use client";

import React, { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import Card from "../shared/Card";
import TopLoadingBar from "../../ui/displays/TopLoadingBar";
import DiagnosticsCardError from "./DiagnosticsCardError";
import styles from "../../../../styles/components/admin/DiagnosticsTab.module.scss";

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

  if (error) {
    return (
      <Card accent="systemStatus">
        <DiagnosticsCardError message={error} onRetry={load} />
      </Card>
    );
  }
  if (!data) {
    return (
      <Card accent="systemStatus">
        <TopLoadingBar active={loading} />
        Loading system status…
      </Card>
    );
  }

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
  // Explicit filter, not hostPoolEntries.length - hostPoolLicensedCount -- that subtraction
  // would also sweep in unreachable hosts (ok: false, licensed: null), miscounting them as
  // confirmed Basic-tier rather than unknown/unreachable.
  const hostPoolBasicCount = hostPoolEntries.filter(([, s]) => s.ok && s.licensed === false).length;

  return (
    <Card accent="systemStatus">
      <TopLoadingBar active={loading} />
      <div className={styles.panelHeader}>
        <span className={styles.panelIconSystemStatus}><MonitorHeartIcon fontSize="small" /></span>
        System Status
      </div>

      <div className={styles.statusBlock}>
        <div className={styles.statusRow}>
          <span className={`${styles.dot} ${data.database.ok ? styles.dotOk : styles.dotDown}`} />
          <span className={styles.statusLabel}>Database</span>
          <span className={styles.statusValue}>
            {data.database.ok ? `Connected · ${data.database.latencyMs}ms` : "Unreachable"}
          </span>
        </div>
      </div>

      <div className={styles.statusBlock}>
        <div className={styles.statusRow}>
          <span className={`${styles.dot} ${gcalReachableCount === gcalEntries.length ? styles.dotOk : styles.dotDown}`} />
          <span className={styles.statusLabel}>Google Calendar</span>
          <span className={styles.statusValue}>
            {gcalReachableCount}/{gcalEntries.length} calendars reachable
          </span>
        </div>
        <div className={styles.gcalSubRow}>
          {gcalEntries.map(([cat, ok]) => (
            <span key={cat} className={ok ? styles.gcalOk : styles.dangerText}>
              {ok ? cat : `${cat}: unreachable`}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.statusBlock}>
        <div className={styles.statusRow}>
          <span className={`${styles.dot} ${data.zoom.reachable ? styles.dotOk : styles.dotDown}`} />
          <span className={styles.statusLabel}>Zoom</span>
          <span className={styles.statusValue}>
            {data.zoom.reachable ? "App reachable" : "App unreachable"}
            {" · "}{roomCalendarOkCount}/{roomCalendarEntries.length} rooms
            {" · "}{hostPoolReachableCount}/{hostPoolEntries.length} hosts
          </span>
        </div>
        <div className={styles.gcalSubRow}>
          {roomCalendarEntries.map(([room, ok]) => (
            <span key={room} className={ok ? styles.gcalOk : styles.dangerText}>
              {ok ? room.replace(/ - Zoom$/, "") : `${room.replace(/ - Zoom$/, "")}: unreachable`}
            </span>
          ))}
        </div>
        <div className={styles.pooledHosts}>
          <div className={styles.pooledHostsHeader}>
            POOLED HOSTS · {hostPoolReachableCount} reachable · {hostPoolLicensedCount} Licensed, {hostPoolBasicCount} Basic
          </div>
          {hostPoolEntries.map(([host, s]) => {
            const tagClass = !s.ok ? styles.hostTagUnreachable : s.licensed === false ? styles.hostTagBasic : styles.hostTagLicensed;
            const tagText = !s.ok ? "Unreachable" : s.licensed === false ? "Basic · 40 min cap" : "Licensed";
            return (
              <div key={host} className={styles.pooledHostRow}>
                <span>{host}</span>
                <span className={tagClass}>{tagText}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.statusBlock}>
        <div className={styles.statusRow}>
          <span className={`${styles.dot} ${styles.dotOk}`} />
          <span className={styles.statusLabel}>Session</span>
          <span className={styles.statusValue}>{email}</span>
        </div>
        <div className={styles.statusDetail}>{roleLabel[role] ?? role}</div>
      </div>
    </Card>
  );
};

export default SystemStatusCard;

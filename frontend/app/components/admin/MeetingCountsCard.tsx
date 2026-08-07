"use client";

import React, { useEffect, useState } from "react";
import StatCounter from "../atoms/StatCounter";
import Card from "./Card";
import TopLoadingBar from "../atoms/TopLoadingBar";
import styles from "../../../styles/components/admin/DiagnosticsTab.module.scss";

interface MeetingCountsData {
  total: number;
  active: number;
  suspended: number;
  byCategory: Record<string, number>;
  recurring: number;
  oneTime: number;
  gcalSyncErrors: number;
  zoomSyncErrors: number;
  pendingZoomSync: number;
}

const MeetingCountsCard: React.FC = () => {
  const [data, setData] = useState<MeetingCountsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/diagnostics/meeting-counts");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: MeetingCountsData = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error("Error fetching meeting counts:", err);
      setError("Failed to load meeting counts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (error) return <Card>{error}</Card>;
  if (!data) return <Card><TopLoadingBar active={loading} />Loading meeting counts…</Card>;

  return (
    <Card>
      <TopLoadingBar active={loading} />
      <div className={styles.sectionLabel}>MEETING COUNTS</div>
      <div className={styles.countsRow}>
        <StatCounter value={data.total} label="Total" />
        <StatCounter value={data.active} label="Active" />
        <StatCounter value={data.suspended} label="Suspended" variant="warning" />
      </div>
      <div className={styles.countsSecondaryRow}>
        <span>
          {Object.entries(data.byCategory)
            .map(([cat, count]) => `${cat}: ${count}`)
            .join(" · ")}
        </span>
        <span>
          Recurring: {data.recurring} · One-time: {data.oneTime}
        </span>
      </div>
      {(data.gcalSyncErrors > 0 || data.zoomSyncErrors > 0) && (
        <div className={styles.countsSecondaryRow}>
          <span className={styles.gcalDown}>
            ⚠ Sync errors — Google Calendar: {data.gcalSyncErrors} · Zoom: {data.zoomSyncErrors}
          </span>
        </div>
      )}
      {data.pendingZoomSync > 0 && (
        <div className={styles.countsSecondaryRow}>
          <span className={styles.gcalDown}>
            ⏳ Waiting on a Zoom host: {data.pendingZoomSync} — calendars
            won&apos;t publish until a host becomes available (see Sync Issues below to retry)
          </span>
        </div>
      )}
    </Card>
  );
};

export default MeetingCountsCard;

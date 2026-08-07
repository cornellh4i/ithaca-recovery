"use client";

import React, { useEffect, useState } from "react";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import StatCounter from "../../atoms/StatCounter";
import Card from "../shared/Card";
import TopLoadingBar from "../../atoms/TopLoadingBar";
import DiagnosticsCardError from "./DiagnosticsCardError";
import styles from "../../../../styles/components/admin/DiagnosticsTab.module.scss";

interface MeetingCountsData {
  total: number;
  active: number;
  suspended: number;
  byCategory: Record<string, number>;
  recurring: number;
  oneTime: number;
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

  if (error) {
    return (
      <Card accent="meetingCounts">
        <DiagnosticsCardError message={error} onRetry={load} />
      </Card>
    );
  }
  if (!data) {
    return (
      <Card accent="meetingCounts">
        <TopLoadingBar active={loading} />
        Loading meeting counts…
      </Card>
    );
  }

  return (
    <Card accent="meetingCounts">
      <TopLoadingBar active={loading} />
      <div className={styles.panelHeader}>
        <span className={styles.panelIconMeetingCounts}><EventAvailableIcon fontSize="small" /></span>
        Meeting Counts
      </div>
      <div className={styles.countsRow}>
        <StatCounter value={data.total} label="Total" />
        <StatCounter value={data.active} label="Active" />
        <StatCounter value={data.suspended} label="Suspended" variant="navy" />
      </div>
      <div className={styles.countsDivider} />
      <div className={styles.countsDetailRow}>
        <span className={styles.countsDetailLabel}>By fellowship</span>
        <span className={styles.countsDetailValue}>
          {Object.entries(data.byCategory)
            .map(([cat, count]) => `${cat}: ${count}`)
            .join(" · ")}
        </span>
      </div>
      <div className={styles.countsDetailRow}>
        <span className={styles.countsDetailLabel}>By schedule</span>
        <span className={styles.countsDetailValue}>
          Recurring: {data.recurring} · One-time: {data.oneTime}
        </span>
      </div>
    </Card>
  );
};

export default MeetingCountsCard;

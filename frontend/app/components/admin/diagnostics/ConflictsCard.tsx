"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "../shared/Card";
import TopLoadingBar from "../../atoms/TopLoadingBar";
import DiagnosticsCardError from "./DiagnosticsCardError";
import ConflictList, { ConflictListRow } from "./ConflictList";
import styles from "../../../../styles/components/admin/DiagnosticsTab.module.scss";

const ConflictsCard: React.FC = () => {
  const [conflicts, setConflicts] = useState<ConflictListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Guards against out-of-order resolution: onMeetingUpdated can fire again (a second edit)
  // before an in-flight load() from a first edit resolves -- without this, the slower first
  // response could land after (and clobber) the faster second one.
  const latestRequestId = useRef(0);

  const load = async () => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/diagnostics/conflicts");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: { conflicts: ConflictListRow[] } = await response.json();
      if (requestId === latestRequestId.current) {
        setConflicts(json.conflicts);
        setError(null);
      }
    } catch (err) {
      console.error("Error fetching conflicts:", err);
      if (requestId === latestRequestId.current) setError("Failed to load conflicts.");
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (error) {
    return (
      <Card accent="conflicts" data-testid="diagnostics-conflicts-panel">
        <DiagnosticsCardError message={error} onRetry={load} />
      </Card>
    );
  }
  if (!conflicts) {
    return (
      <Card accent="conflicts" data-testid="diagnostics-conflicts-panel">
        <TopLoadingBar active={loading} />
        Loading conflicts…
      </Card>
    );
  }

  return (
    <Card accent="conflicts" data-testid="diagnostics-conflicts-panel">
      <TopLoadingBar active={loading} />
      <div className={styles.panelHeader}>
        <span className={`${styles.panelIcon} ${styles.panelIconConflicts}`} />
        Conflicts ({conflicts.length})
      </div>
      <div className={styles.panelSubhead}>
        Sharing a room, Zoom room, or Zoom host at overlapping times. Edit one to resolve.
      </div>
      <ConflictList conflicts={conflicts} onMeetingUpdated={load} />
    </Card>
  );
};

export default ConflictsCard;

"use client";

import React from "react";
import styles from "../../../styles/components/molecules/ConflictList.module.scss";

export interface ConflictListRow {
  field: "room" | "zoomRoom";
  value: string;
  meetings: { mid: string; title: string }[];
}

interface ConflictListProps {
  conflicts: ConflictListRow[];
  emptyLabel?: string;
}

const fieldLabel = (field: "room" | "zoomRoom"): string => (field === "room" ? "Room" : "Zoom Room");

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
        <div key={`${conflict.field}-${conflict.value}-${i}`} className={styles.conflictRow}>
          <div className={styles.conflictMeta}>
            {fieldLabel(conflict.field)}: <span className={styles.conflictValue}>{conflict.value}</span>
          </div>
          <div className={styles.conflictTitles}>
            {conflict.meetings.map((m) => m.title).join(" ↔ ")}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConflictList;

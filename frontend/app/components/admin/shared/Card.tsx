"use client";

import React from "react";
import styles from "../../../../styles/components/admin/Card.module.scss";

// Left-border accent per Diagnostics panel type (2026-08-05 spec) -- each maps to a fixed
// SCSS color variable rather than a passed-in hex, so the palette stays centralized in
// Variables.module.scss like every other color in this app.
export type CardAccent = "syncIssues" | "conflicts" | "suspended" | "systemStatus" | "meetingCounts";

const accentClass: Record<CardAccent, string> = {
  syncIssues: styles.accentSyncIssues,
  conflicts: styles.accentConflicts,
  suspended: styles.accentSuspended,
  systemStatus: styles.accentSystemStatus,
  meetingCounts: styles.accentMeetingCounts,
};

interface CardProps {
  children: React.ReactNode;
  className?: string;
  accent?: CardAccent;
  "data-testid"?: string;
}

const Card: React.FC<CardProps> = ({ children, className, accent, "data-testid": testId }) => (
  <div className={`${styles.card} ${accent ? accentClass[accent] : ""} ${className ?? ""}`} data-testid={testId}>
    {children}
  </div>
);

export default Card;

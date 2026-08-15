"use client";

import React from "react";
import type { Role } from "@prisma/client";
import SystemStatusCard from "./SystemStatusCard";
import MeetingCountsCard from "./MeetingCountsCard";
import SyncIssuesCard from "./SyncIssuesCard";
import ConflictsCard from "./ConflictsCard";
import SuspendedCard from "./SuspendedCard";
import styles from "./DiagnosticsTab.module.scss";

interface DiagnosticsTabProps {
  email: string;
  role: Role;
}

// Each panel below fetches and refreshes independently (its own endpoint under
// /api/admin/diagnostics/*, own loading state) rather than sharing one combined fetch --
// e.g. retrying a sync issue only reloads SyncIssuesCard, not the other four.
const DiagnosticsTab: React.FC<DiagnosticsTabProps> = ({ email, role }) => (
  <div className={styles.container}>
    <SystemStatusCard email={email} role={role} />
    <MeetingCountsCard />
    <SyncIssuesCard />
    <ConflictsCard />
    <SuspendedCard />
  </div>
);

export default DiagnosticsTab;

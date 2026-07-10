"use client";

import React, { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import LockIcon from "@mui/icons-material/Lock";
import DiagnosticsTab from "./DiagnosticsTab";
import UsersTab from "./UsersTab";
import ImportTab from "./ImportTab";
import ExportTab from "./ExportTab";
import styles from "../../../styles/components/organisms/AdminShell.module.scss";

interface AdminShellProps {
  role: Role;
  email: string;
}

type TabKey = "diagnostics" | "users" | "import" | "export";

const allTabs: { key: TabKey; label: string; superAdminOnly: boolean }[] = [
  { key: "diagnostics", label: "Diagnostics", superAdminOnly: false },
  { key: "users", label: "Users", superAdminOnly: true },
  { key: "import", label: "Import", superAdminOnly: true },
  { key: "export", label: "Export", superAdminOnly: true },
];

const AdminShell: React.FC<AdminShellProps> = ({ role, email }) => {
  const isSuperAdmin = role === "SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState<TabKey>("diagnostics");

  useEffect(() => {
    const activeTabInfo = allTabs.find((tab) => tab.key === activeTab);
    if (activeTabInfo?.superAdminOnly && !isSuperAdmin) {
      setActiveTab("diagnostics");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Admin</h1>
      <div className={styles.tabRow}>
        {allTabs.map((tab) => {
          const locked = tab.superAdminOnly && !isSuperAdmin;
          return (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""} ${locked ? styles.tabLocked : ""}`}
              onClick={() => !locked && setActiveTab(tab.key)}
              disabled={locked}
            >
              {tab.label}
              {locked && <LockIcon fontSize="small" className={styles.lockIcon} />}
            </button>
          );
        })}
      </div>
      <div className={styles.tabContent}>
        {activeTab === "diagnostics" && <DiagnosticsTab email={email} role={role} />}
        {activeTab === "users" && isSuperAdmin && <UsersTab />}
        {activeTab === "import" && isSuperAdmin && <ImportTab />}
        {activeTab === "export" && isSuperAdmin && <ExportTab />}
      </div>
    </div>
  );
};

export default AdminShell;

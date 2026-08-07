"use client";

import React, { useState } from "react";
import type { Role } from "@prisma/client";
import LockIcon from "@mui/icons-material/Lock";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DiagnosticsTab from "./diagnostics/DiagnosticsTab";
import UsersTab from "./users/UsersTab";
import ExportTab from "./export/ExportTab";
import { useViewport } from "../../../hooks/useViewport";
import styles from "../../../styles/components/admin/AdminShell.module.scss";

interface AdminShellProps {
  role: Role;
  email: string;
}

type TabKey = "diagnostics" | "users" | "export";

const allTabs: { key: TabKey; label: string; superAdminOnly: boolean }[] = [
  { key: "diagnostics", label: "Diagnostics", superAdminOnly: false },
  { key: "users", label: "Users", superAdminOnly: true },
  { key: "export", label: "Export", superAdminOnly: true },
];

const AdminShell: React.FC<AdminShellProps> = ({ role, email }) => {
  const isSuperAdmin = role === "SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState<TabKey>("diagnostics");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const viewport = useViewport();

  // Admin is a low-frequency, high-consequence, information-dense surface -- worth a heads-up
  // below desktop width rather than a redesign, unlike the calendar's dedicated mobile views.
  // null viewport (not yet measured) intentionally renders no banner, not a default-shown one.
  const showResponsiveBanner = viewport?.device !== "desktop" && viewport !== null && !bannerDismissed;

  // Derived, not synced via effect: falls back to Diagnostics for render whenever the
  // stored activeTab is super-admin-only and the role no longer qualifies (e.g. a
  // real-time demotion), without an extra render/effect round-trip.
  const activeTabInfo = allTabs.find((tab) => tab.key === activeTab);
  const effectiveTab: TabKey = activeTabInfo?.superAdminOnly && !isSuperAdmin ? "diagnostics" : activeTab;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Admin</h1>
      {showResponsiveBanner && (
        <div className={styles.responsiveBanner}>
          <InfoOutlinedIcon fontSize="small" />
          <span className={styles.responsiveBannerText}>
            Admin works best on a larger screen. Some panels may be cramped here.
          </span>
          <button
            className={styles.responsiveBannerDismiss}
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>
      )}
      <div className={styles.tabRow}>
        {allTabs.map((tab) => {
          const locked = tab.superAdminOnly && !isSuperAdmin;
          return (
            <span key={tab.key} className={styles.tabWrapper}>
              <button
                data-testid={`admin-tab-${tab.key}`}
                className={`${styles.tab} ${effectiveTab === tab.key ? styles.tabActive : ""} ${locked ? styles.tabLocked : ""}`}
                onClick={() => !locked && setActiveTab(tab.key)}
                disabled={locked}
              >
                {tab.label}
                {locked && <LockIcon fontSize="small" className={styles.lockIcon} />}
              </button>
              {locked && <span className={styles.tooltip}>Requires super admin</span>}
            </span>
          );
        })}
      </div>
      <div className={styles.tabContent}>
        {effectiveTab === "diagnostics" && <DiagnosticsTab email={email} role={role} />}
        {effectiveTab === "users" && isSuperAdmin && <UsersTab />}
        {effectiveTab === "export" && isSuperAdmin && <ExportTab />}
      </div>
    </div>
  );
};

export default AdminShell;

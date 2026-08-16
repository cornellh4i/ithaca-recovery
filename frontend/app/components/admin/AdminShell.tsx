"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import Icon from "../ui/displays/Icon";
import DiagnosticsTab from "./diagnostics/DiagnosticsTab";
import SignageTab from "./signage/SignageTab";
import UsersTab from "./users/UsersTab";
import BackupsTab from "./backups/BackupsTab";
import ExportTab from "./export/ExportTab";
import { useViewport } from "../../../hooks/useViewport";
import { useToast } from "../shared/ToastProvider";
import { adminTabs, type AdminTabKey } from "./adminTabs";
import styles from "./AdminShell.module.scss";

interface AdminShellProps {
  role: Role;
  email: string;
  activeTab: AdminTabKey;
}

const AdminShell: React.FC<AdminShellProps> = ({ role, email, activeTab }) => {
  const isSuperAdmin = role === "SUPER_ADMIN";

  const router = useRouter();
  const viewport = useViewport();
  const { showToast } = useToast();

  // Admin is a low-frequency, high-consequence, information-dense surface -- worth a heads-up
  // below desktop width rather than a redesign, unlike the calendar's dedicated mobile views.
  // null viewport (not yet measured) intentionally shows no toast, not a default-shown one.
  const showResponsiveBanner = viewport?.device !== "desktop" && viewport !== null;

  // Fires once per transition into the narrow range, not on every render while narrow --
  // the effect dependency only re-runs on an actual value change. Persistent, so it stays
  // until the user closes it via the toast's own dismiss button.
  useEffect(() => {
    if (showResponsiveBanner) {
      showToast({
        variant: "info",
        title: "Admin works best on a larger screen. Some panels may be cramped here.",
        persistent: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResponsiveBanner]);

  // Derived, not synced via effect: falls back to Diagnostics for render whenever the
  // stored activeTab is super-admin-only and the role no longer qualifies (e.g. a
  // real-time demotion), without an extra render/effect round-trip.
  const activeTabInfo = adminTabs.find((tab) => tab.key === activeTab);
  const effectiveTab: AdminTabKey = activeTabInfo?.superAdminOnly && !isSuperAdmin ? "diagnostics" : activeTab;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Admin</h1>
      <div className={styles.tabRow}>
        {adminTabs.map((tab) => {
          const locked = tab.superAdminOnly && !isSuperAdmin;
          return (
            <span key={tab.key} className={styles.tabWrapper}>
              <button
                data-testid={`admin-tab-${tab.key}`}
                className={`${styles.tab} ${effectiveTab === tab.key ? styles.tabActive : ""} ${locked ? styles.tabLocked : ""}`}
                onClick={() => !locked && router.push(`/admin/${tab.key}`, { scroll: false })}
                disabled={locked}
              >
                {tab.label}
                {locked && <Icon name="lock" size={20} className={styles.lockIcon} />}
              </button>
              {locked && <span className={styles.tooltip}>Requires super admin</span>}
            </span>
          );
        })}
      </div>
      <div className={styles.tabContent}>
        {effectiveTab === "diagnostics" && <DiagnosticsTab email={email} role={role} />}
        {effectiveTab === "signage" && <SignageTab />}
        {effectiveTab === "users" && isSuperAdmin && <UsersTab />}
        {effectiveTab === "backups" && isSuperAdmin && <BackupsTab />}
        {effectiveTab === "export" && isSuperAdmin && <ExportTab />}
      </div>
    </div>
  );
};

export default AdminShell;

export type AdminTabKey = "diagnostics" | "signage" | "users" | "backups" | "export";

export const DEFAULT_ADMIN_TAB: AdminTabKey = "diagnostics";

export const adminTabs: { key: AdminTabKey; label: string; superAdminOnly: boolean }[] = [
  { key: "diagnostics", label: "Diagnostics", superAdminOnly: false },
  { key: "signage", label: "Signage", superAdminOnly: false },
  { key: "users", label: "Users", superAdminOnly: true },
  // TODO(backups-api): drop the NODE_ENV guard once real API wiring lands -- this UI-only PR
  // ships mock data only, so the tab stays dev-only until then.
  ...(process.env.NODE_ENV !== "production"
    ? [{ key: "backups" as const, label: "Backups", superAdminOnly: true }]
    : []),
  { key: "export", label: "Export", superAdminOnly: true },
];

export function isAdminTabKey(value: string): value is AdminTabKey {
  return adminTabs.some((tab) => tab.key === value);
}

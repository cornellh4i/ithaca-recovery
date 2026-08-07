"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Role } from "@prisma/client";
import Groups3Icon from "@mui/icons-material/Groups3";
import SearchIcon from "@mui/icons-material/Search";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import type { IAdmin } from "../../../../util/models";
import Card from "../shared/Card";
import TopLoadingBar from "../../atoms/TopLoadingBar";
import StatusPill, { type StatusPillVariant } from "../../atoms/StatusPill";
import EditRoleModal from "./EditRoleModal";
import RemoveUserModal from "./RemoveUserModal";
import InviteUserModal from "./InviteUserModal";
import { ROLE_LABEL } from "../../../../util/roles";
import styles from "../../../../styles/components/admin/UsersTab.module.scss";

const rolePillVariant: Record<Role, StatusPillVariant> = {
  SUPER_ADMIN: "error",
  ADMIN: "success",
  USER: "neutral",
};

// Ascending (User -> Super Admin), each explanation phrased as "everything the role below can
// do, plus X" so the hierarchy reads clearly top-to-bottom without repeating the full list.
const ROLE_LEGEND_ORDER: Role[] = ["USER", "ADMIN", "SUPER_ADMIN"];

const roleExplanation: Record<Role, string> = {
  USER: "Can view meetings.",
  ADMIN: "Can view, create, edit, suspend, and delete meetings.",
  SUPER_ADMIN: "Full Admin access, plus manage users and export data.",
};

// Higher rank sorts first in descending order -- Super Admin > Admin > User, per the ranking
// spelled out for this column specifically (it isn't alphabetical like Name/Email).
const roleRank: Record<Role, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  USER: 1,
};

type SortColumn = "name" | "email" | "role";

const SORT_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
];

const UsersTab: React.FC = () => {
  // null means "not yet loaded" (distinct from "loaded, zero admins") -- lets a refetch after
  // invite/role-change/remove show just the TopLoadingBar over the existing rows instead of
  // blanking the whole table back to "Loading users…" every time.
  const [admins, setAdmins] = useState<IAdmin[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openMenuEmail, setOpenMenuEmail] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<IAdmin | null>(null);
  const [removeTarget, setRemoveTarget] = useState<IAdmin | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [legendOpen, setLegendOpen] = useState(false);
  const [legendPosition, setLegendPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  // Emails with a role-change request in flight -- guards against firing a second overlapping
  // PUT for the same user before the first one resolves (e.g. a fast double-open-modal-and-
  // confirm), which could otherwise let a slower first response land after and clobber a
  // faster second one's optimistic state.
  const [pendingRoleEmails, setPendingRoleEmails] = useState<Set<string>>(new Set());
  // Portaled to document.body (see the render below), same reasoning as the role-legend
  // popover above: the kebab menu otherwise sits inside .tableWrapper, which clips it via
  // overflow-x once the table goes wider than the viewport at phone width. right (not left) is
  // measured from the button so the menu stays right-aligned to it without needing to know the
  // menu's own width up front.
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  // Whichever row's kebab button is currently open -- kept so the scroll/resize effect below
  // can re-measure the same button's position (there's one button per row, not a single fixed
  // ref like the legend's info button).
  const openMenuAnchorRef = useRef<HTMLButtonElement | null>(null);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/retrieve/admins");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: IAdmin[] = await response.json();
      setAdmins(json);
      setError(null);
    } catch (err) {
      console.error("Error fetching admins:", err);
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Standard "load on mount" pattern (https://react.dev/learn/synchronizing-with-effects#fetching-data);
    // loadAdmins manages its own loading/error state internally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAdmins();
  }, []);

  // Closes whichever row's kebab menu is open on an outside click -- delegated to a single
  // document listener (not a per-row ref) since only one menu is ever open at a time. Checks
  // both the anchor and the portaled menu itself (see below): once portaled, the menu is no
  // longer a DOM descendant of the anchor, so a click inside it wouldn't match a
  // [data-user-menu]-only check and would incorrectly count as "outside".
  useEffect(() => {
    if (!openMenuEmail) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-user-menu]") && !target.closest("[data-user-menu-popup]")) {
        setOpenMenuEmail(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuEmail]);

  // Re-measures the open menu's position on scroll/resize -- without this, scrolling the page
  // (or the table's own horizontally-scrolling wrapper) while the menu is open would leave it
  // visually detached from its anchor button, since toggleMenu only measures once at open time.
  useEffect(() => {
    if (!openMenuEmail) return;

    const updatePosition = () => {
      const rect = openMenuAnchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [openMenuEmail]);

  // Same pattern as the kebab menu's outside-click handling above -- the popover itself is
  // portaled (see below), so it's checked via its own data attribute alongside the anchor's,
  // not via DOM containment (it's no longer a descendant of the anchor once portaled).
  useEffect(() => {
    if (!legendOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-role-legend]") && !target.closest("[data-role-legend-popup]")) {
        setLegendOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [legendOpen]);

  // Portaled to document.body (see the render below) so it renders above the table's own
  // horizontal-scroll clipping and isn't bounded by wherever the info icon happens to sit
  // mid-row -- position: fixed + coordinates measured here, same pattern as DatePicker.tsx's
  // calendar popup. Right-aligned under the icon by default, clamped so it can't push past
  // either edge of the viewport regardless of how narrow the screen is.
  useEffect(() => {
    if (!legendOpen) return;

    const updatePosition = () => {
      const rect = infoButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 16;
      const width = Math.min(320, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
      setLegendPosition({ top: rect.bottom + 6, left, width });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [legendOpen]);

  const superAdminCount = (admins ?? []).filter((a) => a.role === "SUPER_ADMIN").length;

  const toggleMenu = (email: string, anchor: HTMLButtonElement) => {
    if (openMenuEmail === email) {
      setOpenMenuEmail(null);
      return;
    }
    openMenuAnchorRef.current = anchor;
    const rect = anchor.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpenMenuEmail(email);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
    } else {
      setSortColumn(column);
      setSortDir("desc");
    }
  };

  const filteredAdmins = useMemo(() => {
    const list = admins ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (a) => a.name.toLowerCase().includes(query) || a.email.toLowerCase().includes(query),
    );
  }, [admins, search]);

  const sortedAdmins = useMemo(() => {
    if (!sortColumn) return filteredAdmins;
    // Ascending comparator first, then flip for "desc" -- keeps Name/Email's alphabetical
    // ordering and Role's Super Admin > Admin > User ordering under one shared formula.
    const compare =
      sortColumn === "role"
        ? (a: IAdmin, b: IAdmin) => roleRank[a.role] - roleRank[b.role]
        : (a: IAdmin, b: IAdmin) => (a[sortColumn] || "").localeCompare(b[sortColumn] || "");
    return [...filteredAdmins].sort((a, b) => (sortDir === "desc" ? -compare(a, b) : compare(a, b)));
  }, [filteredAdmins, sortColumn, sortDir]);

  const handleInvite = async (email: string, role: Role) => {
    setInviting(true);
    try {
      const response = await fetch("/api/write/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        alert(json.error ?? "Failed to invite admin.");
        return;
      }
      setInviteOpen(false);
      await loadAdmins();
    } catch (err) {
      console.error("Error inviting admin:", err);
      alert("Failed to invite admin.");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (email: string, newRole: Role) => {
    const previousRole = admins?.find((a) => a.email === email)?.role;
    setEditTarget(null);
    if (!previousRole || previousRole === newRole || pendingRoleEmails.has(email)) return;

    setPendingRoleEmails((prev) => new Set(prev).add(email));
    setAdmins((prev) => prev?.map((a) => (a.email === email ? { ...a, role: newRole } : a)) ?? prev);
    try {
      const response = await fetch("/api/update/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: newRole }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        // 409 means the server's Serializable-transaction guard caught a genuine race (e.g.
        // two admins demoting different Super Admins at once) -- distinct from a plain
        // validation/business-rule rejection, so it gets its own message pointing at a retry
        // rather than the generic error text.
        alert(response.status === 409
          ? "Someone else changed the admin list at the same time -- please try again."
          : (json.error ?? "Failed to update role."));
        setAdmins((prev) => prev?.map((a) => (a.email === email ? { ...a, role: previousRole } : a)) ?? prev);
        return;
      }
      // Reconcile with the server's own row rather than trusting the optimistic `newRole` --
      // the server is the source of truth for what actually got persisted (e.g. a concurrent
      // request from another session that also touched this row). Guarded on json.email since
      // `.json().catch(() => ({}))` above can silently produce `{}` even when response.ok is
      // true (e.g. a truncated 200 body) -- trusting an empty object here would wipe the row's
      // email and orphan it from every future `a.email === email` lookup.
      const updated = json as Partial<IAdmin>;
      if (!updated.email) {
        await loadAdmins();
        return;
      }
      setAdmins((prev) => prev?.map((a) => (a.email === email ? (updated as IAdmin) : a)) ?? prev);
    } catch (err) {
      console.error("Error updating role:", err);
      alert("Failed to update role.");
      setAdmins((prev) => prev?.map((a) => (a.email === email ? { ...a, role: previousRole } : a)) ?? prev);
    } finally {
      setPendingRoleEmails((prev) => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  const handleRemove = async (email: string) => {
    setRemoveTarget(null);
    try {
      const response = await fetch("/api/delete/admin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        // Same Serializable-transaction race as handleRoleChange above.
        alert(response.status === 409
          ? "Someone else changed the admin list at the same time -- please try again."
          : (json.error ?? "Failed to remove admin."));
        return;
      }
      await loadAdmins();
    } catch (err) {
      console.error("Error removing admin:", err);
      alert("Failed to remove admin.");
    }
  };

  return (
    <div className={styles.container}>
      <Card>
        <TopLoadingBar active={loading} />
        <div className={styles.headerRow}>
          <div className={styles.panelHeader}>
            <span className={styles.panelIconUsers}><Groups3Icon fontSize="small" /></span>
            Users ({(admins ?? []).length})
          </div>
          <div className={styles.headerActions}>
            <div className={styles.searchField}>
              <SearchIcon fontSize="small" className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search name or email"
                aria-label="Search name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            <button className={styles.inviteButton} onClick={() => setInviteOpen(true)}>Invite</button>
          </div>
        </div>
        {admins === null && !error && <div className={styles.emptyState}>Loading users…</div>}
        {error && <div className={styles.emptyState}>{error}</div>}
        {admins !== null && !error && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {SORT_COLUMNS.map(({ key, label }) => {
                    const active = sortColumn === key;
                    return (
                      <th key={key}>
                        <span className={styles.thLabel}>
                          {label}
                          <button
                            className={`${styles.sortButton} ${active ? styles.sortButtonActive : ""}`}
                            aria-label={`Sort by ${label}`}
                            onClick={() => handleSort(key)}
                          >
                            {active && sortDir === "asc" ? (
                              <ArrowDropUpIcon fontSize="small" />
                            ) : (
                              <ArrowDropDownIcon fontSize="small" />
                            )}
                          </button>
                          {key === "role" && (
                            <div className={styles.legendAnchor} data-role-legend>
                              <button
                                ref={infoButtonRef}
                                className={styles.infoButton}
                                aria-label="What do roles mean?"
                                aria-expanded={legendOpen}
                                onClick={() => setLegendOpen((open) => !open)}
                              >
                                <InfoOutlinedIcon fontSize="small" />
                              </button>
                              {legendOpen && legendPosition && createPortal(
                                <div
                                  className={styles.legendPopover}
                                  style={{ top: legendPosition.top, left: legendPosition.left, width: legendPosition.width }}
                                  data-role-legend-popup="true"
                                >
                                  <div className={styles.legendPopoverTitle}>Roles</div>
                                  <div className={styles.legendTable}>
                                    {ROLE_LEGEND_ORDER.map((role) => (
                                      <React.Fragment key={role}>
                                        <div className={styles.legendPillCell}>
                                          <StatusPill variant={rolePillVariant[role]}>{ROLE_LABEL[role]}</StatusPill>
                                        </div>
                                        <div className={styles.legendDescCell}>{roleExplanation[role]}</div>
                                      </React.Fragment>
                                    ))}
                                  </div>
                                </div>,
                                document.body,
                              )}
                            </div>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedAdmins.map((admin) => {
                  const isLastSuperAdmin = admin.role === "SUPER_ADMIN" && superAdminCount <= 1;
                  const menuOpen = openMenuEmail === admin.email;
                  const roleChangePending = pendingRoleEmails.has(admin.email);
                  return (
                    <tr key={admin.email}>
                      <td>{admin.name || "—"}</td>
                      <td className={styles.emailCell}>{admin.email}</td>
                      <td>
                        <StatusPill variant={rolePillVariant[admin.role]}>{ROLE_LABEL[admin.role]}</StatusPill>
                      </td>
                      <td className={styles.actionCell}>
                        <div className={styles.moreOptions} data-user-menu>
                          <button
                            aria-label="User options"
                            aria-expanded={menuOpen}
                            disabled={roleChangePending}
                            onClick={(e) => toggleMenu(admin.email, e.currentTarget)}
                          >
                            ⋮
                          </button>
                          {menuOpen && menuPosition && createPortal(
                            <div
                              className={styles.optionsMenu}
                              style={{ top: menuPosition.top, right: menuPosition.right }}
                              data-user-menu-popup="true"
                            >
                              <button onClick={() => { setOpenMenuEmail(null); setEditTarget(admin); }}>
                                Edit Role
                              </button>
                              <button
                                className={styles.dangerOption}
                                disabled={isLastSuperAdmin}
                                onClick={() => {
                                  if (isLastSuperAdmin) return;
                                  setOpenMenuEmail(null);
                                  setRemoveTarget(admin);
                                }}
                              >
                                Remove User
                              </button>
                            </div>,
                            document.body,
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EditRoleModal
        isOpen={!!editTarget}
        name={editTarget?.name ?? ""}
        email={editTarget?.email ?? ""}
        currentRole={editTarget?.role ?? "USER"}
        isLastSuperAdmin={!!editTarget && editTarget.role === "SUPER_ADMIN" && superAdminCount <= 1}
        onCancel={() => setEditTarget(null)}
        onConfirm={(role) => editTarget && handleRoleChange(editTarget.email, role)}
      />

      <RemoveUserModal
        isOpen={!!removeTarget}
        email={removeTarget?.email ?? ""}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && handleRemove(removeTarget.email)}
      />

      <InviteUserModal
        isOpen={inviteOpen}
        inviting={inviting}
        onCancel={() => setInviteOpen(false)}
        onInvite={handleInvite}
      />
    </div>
  );
};

export default UsersTab;

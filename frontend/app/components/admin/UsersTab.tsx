"use client";

import React, { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import type { IAdmin } from "../../../util/models";
import TextField from "../atoms/TextField";
import styles from "../../../styles/components/admin/UsersTab.module.scss";

const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  USER: "User",
};

const UsersTab: React.FC = () => {
  const [admins, setAdmins] = useState<IAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("ADMIN");
  const [inviting, setInviting] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);
  const [updatedEmail, setUpdatedEmail] = useState<string | null>(null);

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

  const superAdminCount = admins.filter((a) => a.role === "SUPER_ADMIN").length;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const response = await fetch("/api/write/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        alert(json.error ?? "Failed to invite admin.");
        return;
      }
      setInviteEmail("");
      setInviteRole("ADMIN");
      await loadAdmins();
    } catch (err) {
      console.error("Error inviting admin:", err);
      alert("Failed to invite admin.");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (email: string, newRole: Role) => {
    const previousRole = admins.find((a) => a.email === email)?.role;
    if (!previousRole || previousRole === newRole) return;

    setAdmins((prev) => prev.map((a) => (a.email === email ? { ...a, role: newRole } : a)));
    setUpdatingEmail(email);
    setUpdatedEmail(null);
    try {
      const response = await fetch("/api/update/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: newRole }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        alert(json.error ?? "Failed to update role.");
        setAdmins((prev) => prev.map((a) => (a.email === email ? { ...a, role: previousRole } : a)));
        return;
      }
      setUpdatedEmail(email);
      setTimeout(() => setUpdatedEmail((curr) => (curr === email ? null : curr)), 2000);
    } catch (err) {
      console.error("Error updating role:", err);
      alert("Failed to update role.");
      setAdmins((prev) => prev.map((a) => (a.email === email ? { ...a, role: previousRole } : a)));
    } finally {
      setUpdatingEmail(null);
    }
  };

  const handleRemove = async (email: string) => {
    if (!confirm(`Remove ${email} as an admin?`)) return;
    try {
      const response = await fetch("/api/delete/admin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        alert(json.error ?? "Failed to remove admin.");
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
      <div className={styles.card}>
        <div className={styles.sectionLabel}>USERS</div>
        {loading && <div className={styles.emptyState}>Loading users…</div>}
        {error && <div className={styles.emptyState}>{error}</div>}
        {!loading && !error && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const isLastSuperAdmin = admin.role === "SUPER_ADMIN" && superAdminCount <= 1;
                return (
                  <tr key={admin.email}>
                    <td>{admin.name || "—"}</td>
                    <td className={styles.emailCell}>{admin.email}</td>
                    <td>
                      <div className={styles.roleCell}>
                        <select
                          className={styles.roleSelect}
                          value={admin.role}
                          disabled={isLastSuperAdmin || updatingEmail === admin.email}
                          onChange={(e) => handleRoleChange(admin.email, e.target.value as Role)}
                        >
                          <option value="SUPER_ADMIN">{roleLabel.SUPER_ADMIN}</option>
                          <option value="ADMIN">{roleLabel.ADMIN}</option>
                          <option value="USER">{roleLabel.USER}</option>
                        </select>
                        {updatedEmail === admin.email && (
                          <span className={styles.updatedBadge}>Updated ✓</span>
                        )}
                      </div>
                      {isLastSuperAdmin && (
                        <div className={styles.menuCaption}>Can&apos;t change the last Super Admin&apos;s role.</div>
                      )}
                    </td>
                    <td className={styles.actionCell}>
                      <button
                        className={isLastSuperAdmin ? styles.removeButtonDisabled : styles.removeButton}
                        onClick={() => !isLastSuperAdmin && handleRemove(admin.email)}
                        disabled={isLastSuperAdmin}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.sectionLabel}>INVITE USER</div>
        <div className={styles.inviteRow}>
          <TextField input="Email address" value={inviteEmail} onChange={setInviteEmail} />
          <select
            className={styles.roleSelect}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
          >
            <option value="SUPER_ADMIN">{roleLabel.SUPER_ADMIN}</option>
            <option value="ADMIN">{roleLabel.ADMIN}</option>
            <option value="USER">{roleLabel.USER}</option>
          </select>
          <button className={styles.inviteButton} onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
            Send Invite
          </button>
        </div>
        <div className={styles.inviteHelp}>
          Users can sign in using there assigned email.
            Users can view meetings; Admins can also create and edit them;
            only Super Admins can manage other users, import spreadsheets, and export data.
        </div>
      </div>
    </div>
  );
};

export default UsersTab;

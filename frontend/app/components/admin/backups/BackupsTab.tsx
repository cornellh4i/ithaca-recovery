"use client";

import React, { useState } from "react";
import BackupHealthCard from "./BackupHealthCard";
import SnapshotsCard from "./SnapshotsCard";
import RestoreRunbookCard from "./RestoreRunbookCard";
import RecentActivityCard from "./RecentActivityCard";
import SolidButton from "../../ui/buttons/SolidButton";
import { generateMockActivityEvents, generateMockBackupHealth, generateMockBackupRows } from "./mockBackups";
import { useToast } from "../../shared/ToastProvider";
import styles from "./BackupsTab.module.scss";

// Mock dispatch takes this long before the transient lock clears -- long enough to read the
// toast, short enough not to feel broken in this UI-only PR.
const MOCK_DISPATCH_MS = 2500;

/**
 * Backups admin tab. UI-only in this PR: every data source below is a deterministic mock
 * fixture (see mockBackups.ts), not a live fetch. Every seam that becomes a real endpoint in
 * the follow-up API-wiring PR is marked `// TODO(backups-api)`. All state lives here per the
 * plan's F7 scope -- the four cards below are pure presentational.
 */
const BackupsTab: React.FC = () => {
  // Single `now` anchor for this render tree's lifetime -- matches the pattern the mock
  // generators require (explicit `now: Date` param, no Date.now() at module scope) and keeps
  // "Expires in"/freshness/relative-age labels consistent across all four cards on one mount.
  const [now] = useState(() => new Date());

  // TODO(backups-api): replace with GET /api/admin/backups (rows) once the read-only GCS
  // listing route lands.
  const [rows] = useState(() => generateMockBackupRows(now));
  // TODO(backups-api): replace with GET /api/admin/backups/health.
  const [health] = useState(() => generateMockBackupHealth(now, rows));
  // TODO(backups-api): replace with GET /api/admin/backups/activity (GitHub Actions runs API).
  const [activity] = useState(() => generateMockActivityEvents(now));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Mirrors the real `concurrency: db-backup` guard: Back Up Now is disabled while a run is
  // "in flight" so a double-click can't double-dispatch, same invariant the real
  // workflow_dispatch caller will need (see the plan's follow-up section on correlating runs).
  const [creating, setCreating] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);

  const { showToast } = useToast();

  const selectedRow = rows.find((row) => row.id === selectedId) ?? null;

  const handleBackUpNow = () => {
    if (lockedBy) return;
    setCreating(true);
    setLockedBy("admin@ithacarecovery.org");
    showToast({
      variant: "info",
      title: "Backup dispatched — runs appear in Recent Activity",
    });

    // TODO(backups-api): replace with POST /api/admin/backups (workflow_dispatch via a
    // fine-grained PAT). workflow_dispatch doesn't return a run id -- the real handler must
    // hold this same optimistic lock while polling for a run carrying the dispatch `reason`.
    window.setTimeout(() => {
      setCreating(false);
      setLockedBy(null);
    }, MOCK_DISPATCH_MS);
  };

  const handleDownload = (_id: string) => {
    // TODO(backups-api): replace with GET /api/admin/backups/:id/download (5-minute V4 signed
    // URL, audit-logged). No real file transfer happens in this PR.
    showToast({
      variant: "info",
      title: "Signed-URL download arrives with the API wiring PR",
    });
  };

  return (
    <div className={styles.container}>
      <SolidButton
        label="Back Up Now"
        onClick={handleBackUpNow}
        loading={creating}
        disabled={!!lockedBy}
      />

      <BackupHealthCard health={health} now={now} />
      <SnapshotsCard
        rows={rows}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
        page={page}
        onPageChange={setPage}
        onDownload={handleDownload}
        now={now}
      />
      <RestoreRunbookCard selected={selectedRow} />
      <RecentActivityCard events={activity} now={now} />
    </div>
  );
};

export default BackupsTab;

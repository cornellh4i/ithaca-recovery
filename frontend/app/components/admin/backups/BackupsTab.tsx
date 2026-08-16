"use client";

import React, { useEffect, useRef, useState } from "react";
import BackupHealthCard from "./BackupHealthCard";
import SnapshotsCard, { matchesFilter } from "./SnapshotsCard";
import RestoreRunbookCard from "./RestoreRunbookCard";
import RecentActivityCard from "./RecentActivityCard";
import SolidButton from "../../ui/buttons/SolidButton";
import DiagnosticsCardError from "../diagnostics/DiagnosticsCardError";
import { useToast } from "../../shared/ToastProvider";
import type {
  ActivityEvent,
  ActivityListResponse,
  BackupDispatchResponse,
  BackupDownloadResponse,
  BackupHealth,
  BackupListResponse,
  BackupListRow,
  BackupTierFilter,
  BackupsDataMode,
  BackupsEnvelope,
  BackupsUnconfiguredResponse,
} from "../../../../types/backups";
import styles from "./BackupsTab.module.scss";

// Back Up Now dispatches, then polls Recent Activity for a new run rather than trusting a
// fixed delay -- workflow_dispatch doesn't return a run id, so "a new run appeared" is the
// only real completion signal available.
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 90_000;

type TabPhase = "loading" | "unconfigured" | "error" | "ready";

/**
 * Backups admin tab. Fetches the three read endpoints in parallel on mount; every seam
 * documented in the plan (F7) is a real `/api/admin/backups*` route -- see types/backups.ts
 * for the shared response contract. Routes serve deterministic mock fixtures (mode "mock")
 * whenever backup credentials aren't configured outside production, and 503 with a
 * `missing[]` list when they're absent in production.
 */
const BackupsTab: React.FC = () => {
  const [phase, setPhase] = useState<TabPhase>("loading");
  const [missing, setMissing] = useState<string[]>([]);

  const [rows, setRows] = useState<BackupListRow[]>([]);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [mode, setMode] = useState<BackupsDataMode | null>(null);

  // Single `now` anchor for this render tree's lifetime -- set only when data actually
  // arrives (never at render time), so "Expires in"/freshness/relative-age labels stay
  // consistent across all four cards for as long as this data is on screen.
  const [now, setNow] = useState<Date | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<BackupTierFilter>("all");

  const [creating, setCreating] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);

  const { showToast } = useToast();

  const handleFilterChange = (next: BackupTierFilter) => {
    setFilter(next);
    setPage(0);
    // Prevents the Restore Runbook command box from pointing at a row that's now hidden
    // behind the new filter -- an invisible selection is worse than none.
    const selectedRow = rows.find((row) => row.id === selectedId);
    if (selectedRow && !matchesFilter(selectedRow, next)) {
      setSelectedId(null);
    }
  };

  /** Re-fetches all three read endpoints and replaces state in place -- used both for the
   * initial load (wrapped with phase transitions) and for a post-dispatch refresh. */
  const fetchAll = async (): Promise<{ ok: true } | { ok: false; unconfigured: BackupsUnconfiguredResponse } | { ok: false; unconfigured: null }> => {
    const [rowsRes, healthRes, activityRes] = await Promise.all([
      fetch("/api/admin/backups"),
      fetch("/api/admin/backups/health"),
      fetch("/api/admin/backups/activity"),
    ]);

    const unconfiguredRes = [rowsRes, healthRes, activityRes].find((res) => res.status === 503);
    if (unconfiguredRes) {
      const body: BackupsUnconfiguredResponse = await unconfiguredRes.json();
      return { ok: false, unconfigured: body };
    }
    if (![rowsRes, healthRes, activityRes].every((res) => res.ok)) {
      return { ok: false, unconfigured: null };
    }

    const [rowsEnvelope, healthEnvelope, activityEnvelope]: [
      BackupsEnvelope<BackupListResponse>,
      BackupsEnvelope<BackupHealth>,
      BackupsEnvelope<ActivityListResponse>,
    ] = await Promise.all([rowsRes.json(), healthRes.json(), activityRes.json()]);

    setRows(rowsEnvelope.data.rows);
    setHealth(healthEnvelope.data);
    setActivity(activityEnvelope.data.events);
    setMode(rowsEnvelope.mode);
    setNow(new Date());
    return { ok: true };
  };

  const load = async () => {
    setPhase("loading");
    try {
      const result = await fetchAll();
      if (!result.ok) {
        if (result.unconfigured) {
          setMissing(result.unconfigured.missing);
          setPhase("unconfigured");
        } else {
          throw new Error("HTTP error fetching backups data");
        }
        return;
      }
      setPhase("ready");
    } catch (err) {
      console.error("Error loading backups data:", err);
      setPhase("error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const selectedRow = rows.find((row) => row.id === selectedId) ?? null;
  // Rows are sorted newest-first by the list route -- the newest row's appVersion is the
  // deployed app version the Snapshots subhead reports.
  const latestAppVersion = rows[0]?.appVersion ?? "unknown";

  /** Polls GET /activity every 10s for a run id absent from the pre-dispatch baseline,
   * clearing the optimistic lock once one appears (or the 90s window elapses). */
  const pollForNewActivity = (baselineIds: Set<string>) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const tick = async () => {
      try {
        const res = await fetch("/api/admin/backups/activity");
        if (res.ok) {
          const envelope: BackupsEnvelope<ActivityListResponse> = await res.json();
          const hasNewRun = envelope.data.events.some((event) => !baselineIds.has(event.id));
          if (hasNewRun) {
            await fetchAll();
            setCreating(false);
            setLockedBy(null);
            return;
          }
        }
      } catch (err) {
        console.error("Error polling backup activity:", err);
      }

      if (Date.now() >= deadline) {
        setCreating(false);
        setLockedBy(null);
        return;
      }
      pollTimeoutRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    pollTimeoutRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
  };

  const handleBackUpNow = async () => {
    // Mirrors the real `concurrency: db-backup` guard: Back Up Now is disabled while a run
    // is in flight so a double-click can't double-dispatch.
    if (lockedBy) return;
    setCreating(true);
    const baselineIds = new Set(activity.map((event) => event.id));

    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const body: BackupDispatchResponse = await res.json();
      setLockedBy(body.triggeredBy);
      showToast({
        variant: "info",
        title: "Backup dispatched — runs appear in Recent Activity",
      });
      pollForNewActivity(baselineIds);
    } catch (err) {
      console.error("Error dispatching backup:", err);
      showToast({ variant: "error", title: "Failed to dispatch backup" });
      setCreating(false);
      setLockedBy(null);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/backups/${id}/download`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const body: BackupDownloadResponse = await res.json();
      if (body.url) {
        window.open(body.url, "_blank", "noopener");
      } else {
        showToast({
          variant: "info",
          title: "Sample backup — no file to download in mock mode",
        });
      }
    } catch (err) {
      console.error("Error fetching backup download URL:", err);
      showToast({ variant: "error", title: "Failed to get download link" });
    }
  };

  if (phase === "loading") {
    return <div className={styles.loadingState}>Loading backups…</div>;
  }

  if (phase === "error") {
    return (
      <DiagnosticsCardError message="Failed to load backups data." onRetry={load} />
    );
  }

  if (phase === "unconfigured") {
    return (
      <div className={styles.warningBanner}>
        <div className={styles.warningBannerBody}>
          <p className={styles.warningBannerTitle}>Backup monitoring isn&apos;t configured in this environment</p>
          <p className={styles.warningBannerText}>
            Missing: {missing.join(", ")}. See{" "}
            <code>docs/02-handoff/backup-infra-setup.md</code> to configure backup credentials.
          </p>
        </div>
        <button type="button" className={styles.retryButton} onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  // phase === "ready" -- now, health are guaranteed non-null by fetchAll's success path.
  return (
    <div className={styles.container}>
      {mode === "mock" && (
        <span className={styles.modeBadge}>Sample data — backup credentials not configured</span>
      )}

      <div className={styles.tabHeaderRow}>
        <SolidButton
          label="Back Up Now"
          onClick={handleBackUpNow}
          loading={creating}
          disabled={!!lockedBy}
          className={styles.backUpNowButton}
        />
      </div>

      {health && now && (
        <>
          <BackupHealthCard health={health} now={now} />
          <SnapshotsCard
            rows={rows}
            filter={filter}
            onFilterChange={handleFilterChange}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
            page={page}
            onPageChange={setPage}
            onDownload={handleDownload}
            now={now}
            latestAppVersion={latestAppVersion}
          />
          <RestoreRunbookCard selected={selectedRow} now={now} />
          <RecentActivityCard events={activity} now={now} />
        </>
      )}
    </div>
  );
};

export default BackupsTab;

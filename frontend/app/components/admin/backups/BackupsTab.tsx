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
// Mock activity fixtures never grow, so polling for "a new run appeared" would always spin the
// full 90s window. The dispatch response's own `mode` tells us this up front -- skip polling
// and clear the lock after a short delay that still lets the toast register as a real action.
const MOCK_DISPATCH_SETTLE_MS = 600;

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
  // Non-null only when GET /activity 503s independently of list/health -- GitHub credentials
  // are not the tab's storage backbone, so this degrades just the activity card.
  const [activityUnavailable, setActivityUnavailable] = useState<string[] | null>(null);

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
  // Guards every setState after an in-flight fetch/poll tick resolves post-unmount -- clearing
  // the pending timeout in the effect cleanup isn't enough because a tick that's already mid-
  // flight when unmount happens can still re-arm the next timeout before it checks anything.
  const cancelledRef = useRef(false);

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
   * initial load (wrapped with phase transitions) and for a post-dispatch refresh.
   *
   * List and health share the same storage credentials as their backbone, so either 503ing
   * degrades the whole tab. Activity's GitHub credentials are independent -- an activity-only
   * 503 leaves list/health rendering and just degrades the Recent Activity card. */
  const fetchAll = async (): Promise<{ ok: true } | { ok: false; unconfigured: BackupsUnconfiguredResponse } | { ok: false; unconfigured: null }> => {
    const [rowsRes, healthRes, activityRes] = await Promise.all([
      fetch("/api/admin/backups"),
      fetch("/api/admin/backups/health"),
      fetch("/api/admin/backups/activity"),
    ]);

    const backboneUnconfigured = [rowsRes, healthRes].filter((res) => res.status === 503);
    if (backboneUnconfigured.length > 0) {
      const bodies: BackupsUnconfiguredResponse[] = await Promise.all(backboneUnconfigured.map((res) => res.json()));
      return { ok: false, unconfigured: { configured: false, missing: Array.from(new Set(bodies.flatMap((b) => b.missing))) } };
    }
    if (!rowsRes.ok || !healthRes.ok) {
      return { ok: false, unconfigured: null };
    }

    const [rowsEnvelope, healthEnvelope]: [BackupsEnvelope<BackupListResponse>, BackupsEnvelope<BackupHealth>] = await Promise.all([
      rowsRes.json(),
      healthRes.json(),
    ]);

    let activityEvents: ActivityEvent[] = [];
    let activityMode: BackupsDataMode | null = null;
    let activityMissing: string[] | null = null;
    if (activityRes.status === 503) {
      const body: BackupsUnconfiguredResponse = await activityRes.json();
      activityMissing = body.missing;
    } else if (activityRes.ok) {
      const activityEnvelope: BackupsEnvelope<ActivityListResponse> = await activityRes.json();
      activityEvents = activityEnvelope.data.events;
      activityMode = activityEnvelope.mode;
    } else {
      return { ok: false, unconfigured: null };
    }

    if (cancelledRef.current) return { ok: true };
    setRows(rowsEnvelope.data.rows);
    setHealth(healthEnvelope.data);
    setActivity(activityEvents);
    setActivityUnavailable(activityMissing);
    // Badged when ANY of the three envelopes reports mock, not only the list one.
    setMode(rowsEnvelope.mode === "mock" || healthEnvelope.mode === "mock" || activityMode === "mock" ? "mock" : "live");
    setNow(new Date());
    return { ok: true };
  };

  const load = async () => {
    setPhase("loading");
    try {
      const result = await fetchAll();
      if (cancelledRef.current) return;
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
      if (cancelledRef.current) return;
      console.error("Error loading backups data:", err);
      setPhase("error");
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      cancelledRef.current = true;
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
      if (cancelledRef.current) return;
      try {
        const res = await fetch("/api/admin/backups/activity");
        if (cancelledRef.current) return;
        if (res.ok) {
          const envelope: BackupsEnvelope<ActivityListResponse> = await res.json();
          if (cancelledRef.current) return;
          const hasNewRun = envelope.data.events.some((event) => !baselineIds.has(event.id));
          if (hasNewRun) {
            await fetchAll();
            if (cancelledRef.current) return;
            setCreating(false);
            setLockedBy(null);
            return;
          }
        }
      } catch (err) {
        console.error("Error polling backup activity:", err);
      }

      if (cancelledRef.current) return;
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
      if (body.mode === "mock") {
        // Mock activity fixtures never grow, so polling would always burn the full 90s window.
        pollTimeoutRef.current = window.setTimeout(() => {
          if (cancelledRef.current) return;
          setCreating(false);
          setLockedBy(null);
        }, MOCK_DISPATCH_SETTLE_MS);
        return;
      }
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
      // 409 is a deliberate route answer (working-bucket copy lifecycle-deleted or never
      // uploaded), not a transient failure -- the operator needs to know retrying won't help.
      if (res.status === 409) {
        showToast({
          variant: "error",
          title: "This snapshot is no longer in the working bucket — restore it from the archive or R2 copy instead",
        });
        return;
      }
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
          <RecentActivityCard events={activity} now={now} unavailable={activityUnavailable} />
        </>
      )}
    </div>
  );
};

export default BackupsTab;

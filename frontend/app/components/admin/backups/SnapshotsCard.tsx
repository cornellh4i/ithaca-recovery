"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../ui/displays/Icon";
import Card from "../shared/Card";
import CardHeader from "../shared/CardHeader";
import type { BackupListRow, BackupReplica, BackupTier, BackupTierFilter } from "../../../../types/backups";
import { ALL_BACKUP_REPLICAS } from "../../../../types/backups";
import { formatETDateString, formatETLongDateTime, formatETTime } from "../../../../util/date/timeUtils";
import { formatBytes } from "../../../../util/format/bytes";
import styles from "./BackupsTab.module.scss";

const TIER_LABEL: Record<BackupTier, string> = {
  daily: "Daily",
  monthly: "Monthly",
  permanent: "Permanent",
};

const TIER_CLASS: Record<BackupTier, string> = {
  daily: styles.tierDaily,
  monthly: styles.tierMonthly,
  permanent: styles.tierPermanent,
};

const REPLICA_LABEL: Record<BackupReplica, string> = {
  "gcs-working": "GCS (working)",
  "gcs-archive": "GCS (archive)",
  r2: "Cloudflare R2",
};

const FILTER_LABEL: Record<BackupTierFilter, string> = {
  all: "All",
  daily: "Daily",
  monthly: "Monthly",
  permanent: "Permanent",
  unverified: "Unverified",
};

const FILTER_ORDER: BackupTierFilter[] = ["all", "daily", "monthly", "permanent", "unverified"];

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const HOURS_48_MS = 48 * 60 * 60 * 1000;

const DOWNLOAD_ARIA_LABEL = "Download (encrypted) — requires an offline age key";
const DOWNLOAD_TOOLTIP =
  "Downloads the encrypted .dump.age artifact. Requires the offline age private key to decrypt -- unusable on its own.";

/**
 * "Today, 3:17 AM" / "Yesterday, 9:17 PM" for rows within the last 48h (ET calendar-day
 * comparison, not a raw ms cutoff, so the boundary lines up with what "Yesterday" means to
 * a reader); otherwise falls back to the absolute ET long date + time.
 */
function formatCreatedAt(createdAt: string, now: Date): string {
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  if (diffMs >= 0 && diffMs < HOURS_48_MS) {
    const createdDay = formatETDateString(created);
    const nowDay = formatETDateString(now);
    const yesterday = formatETDateString(new Date(now.getTime() - DAY_MS));
    if (createdDay === nowDay) return `Today, ${formatETTime(created)}`;
    if (createdDay === yesterday) return `Yesterday, ${formatETTime(created)}`;
  }
  return formatETLongDateTime(created);
}

/** "in 21d" / "in 11mo" / "Never" / "expired", relative to `now`. */
function formatExpiresIn(expiresAt: string | null, now: Date): string {
  if (!expiresAt) return "Never";
  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  if (diffMs < 0) return "expired";
  const diffDays = Math.round(diffMs / DAY_MS);
  if (diffMs < MONTH_MS) return `in ${diffDays}d`;
  const diffMonths = Math.round(diffMs / MONTH_MS);
  return `in ${diffMonths}mo`;
}

const VERIFIED_TOOLTIP =
  "Verified: restored into a scratch database and structurally checked during the backup run";
const UNVERIFIED_TOOLTIP =
  "Unverified: no verification record exists — likely created outside the backup workflow. Prefer a Verified snapshot in an incident";

interface VerifiedLegendEntry {
  icon: "check-circle" | "error-outline";
  colorClass: string;
  label: string;
  description: string;
}

const VERIFIED_LEGEND: VerifiedLegendEntry[] = [
  {
    icon: "check-circle",
    colorClass: "verifiedYes",
    label: "Verified",
    description: "restored into a scratch database and structurally checked during its backup run",
  },
  {
    icon: "error-outline",
    colorClass: "verifiedNo",
    label: "Unverified",
    description: "no verification record exists; likely created outside the backup workflow. Prefer a Verified snapshot in an incident",
  },
];

/** Per-replica present/missing breakdown for the replica count's hover tooltip -- every row
 * gets this, not just degraded ones, so "3 of 3" is still legible on hover as which three. */
function replicaStatusList(row: BackupListRow): { label: string; present: boolean }[] {
  return ALL_BACKUP_REPLICAS.map((r) => ({
    label: REPLICA_LABEL[r],
    present: row.replicas.includes(r),
  }));
}

export function matchesFilter(row: BackupListRow, filter: BackupTierFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unverified") return !row.verified;
  return row.tier === filter;
}

const PAGE_SIZE = 10;

interface SnapshotsCardProps {
  /** Full, unfiltered row set -- this component owns filtering and pagination internally so
   * the parent doesn't need to recompute a filtered/paginated slice on every render just to
   * hand this table what it would otherwise derive itself; the parent only owns which filter
   * is active (for other cards / URL state) and the current page number. */
  rows: BackupListRow[];
  filter: BackupTierFilter;
  onFilterChange: (filter: BackupTierFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  onDownload: (id: string) => void;
  /** Reference instant for relative date/expiry math -- passed in, never read from Date.now() here. */
  now: Date;
  latestAppVersion: string;
}

interface SnapshotRowProps {
  row: BackupListRow;
  selected: boolean;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
  now: Date;
}

const SnapshotRow: React.FC<SnapshotRowProps> = ({ row, selected, onSelect, onDownload, now }) => {
  const createdLabel = formatCreatedAt(row.createdAt, now);
  const accessibleName = `${createdLabel} snapshot`;
  const replicaCount = row.replicas.length;
  const degraded = replicaCount < ALL_BACKUP_REPLICAS.length;

  return (
    <tr
      className={`${styles.row} ${selected ? styles.rowSelected : ""} ${row.verified ? "" : styles.rowUnverified}`}
      onClick={() => onSelect(row.id)}
    >
      <td className={styles.radioCell} onClick={(e) => e.stopPropagation()}>
        <input
          type="radio"
          name="snapshot-select"
          checked={selected}
          aria-label={`Select ${accessibleName}`}
          onChange={() => onSelect(row.id)}
        />
      </td>
      <td className={styles.dateCell}>
        {createdLabel}
        {row.source === "manual" && <span className={styles.sourceChip}>Manual</span>}
      </td>
      <td>
        <span className={`${styles.tierPill} ${TIER_CLASS[row.tier]}`}>{TIER_LABEL[row.tier]}</span>
      </td>
      <td className={styles.sizeCell}>{formatBytes(row.sizeBytes)}</td>
      <td>
        <span
          className={`${styles.verifiedIndicator} ${row.verified ? styles.verifiedYes : styles.verifiedNo}`}
          title={row.verified ? VERIFIED_TOOLTIP : UNVERIFIED_TOOLTIP}
          aria-label={row.verified ? "Verified" : "Unverified"}
        >
          <Icon name={row.verified ? "check-circle" : "error-outline"} size={16} />
        </span>
      </td>
      <td>
        <span className={styles.replicaTooltipAnchor}>
          <span
            className={`${styles.replicaCount} ${degraded ? styles.replicaCountDegraded : ""}`}
            tabIndex={0}
          >
            {replicaCount} of {ALL_BACKUP_REPLICAS.length}
          </span>
          <span className={styles.replicaTooltip} role="tooltip">
            {replicaStatusList(row).map(({ label, present }) => (
              <span
                key={label}
                className={present ? styles.replicaTooltipLinePresent : styles.replicaTooltipLineMissing}
              >
                {label}: {present ? "present" : "missing"}
              </span>
            ))}
          </span>
        </span>
      </td>
      <td className={styles.expiresCell}>
        {row.expiresAt === null ? (
          <span className={styles.expiresNever}>Never</span>
        ) : new Date(row.expiresAt).getTime() < now.getTime() ? (
          <span className={styles.expiresExpired}>{formatExpiresIn(row.expiresAt, now)}</span>
        ) : (
          formatExpiresIn(row.expiresAt, now)
        )}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.downloadIconButton}
          title={DOWNLOAD_TOOLTIP}
          aria-label={`${DOWNLOAD_ARIA_LABEL} (${accessibleName})`}
          onClick={() => onDownload(row.id)}
        >
          <Icon name="download" size={14} />
        </button>
      </td>
    </tr>
  );
};

/**
 * Snapshots table -- pure presentational, but owns filtering + pagination internally (see
 * the `rows` prop doc): the parent hands down the full unfiltered row set and only tracks
 * which filter/page is active, rather than recomputing a derived slice itself. Single-select
 * radio drives the Restore Runbook card below; onDownload fires a stub handler in this PR
 * (no real file transfer -- see the tooltip and aria-label wording).
 */
const SnapshotsCard: React.FC<SnapshotsCardProps> = ({
  rows,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  page,
  onPageChange,
  onDownload,
  now,
  latestAppVersion,
}) => {
  const [legendOpen, setLegendOpen] = useState(false);
  const [legendPosition, setLegendPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);

  // Same pattern as UsersTab.tsx's role legend: portaled to document.body so it renders above
  // the table's own horizontal-scroll clipping, closed on outside click via its own data
  // attribute (it's no longer a DOM descendant of the anchor once portaled).
  useEffect(() => {
    if (!legendOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-verified-legend]") && !target.closest("[data-verified-legend-popup]")) {
        setLegendOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [legendOpen]);

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

  const filteredRows = rows.filter((row) => matchesFilter(row, filter));
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageRows = filteredRows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(filteredRows.length, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const unverifiedCount = rows.filter((row) => !row.verified).length;
  const filterCounts: Record<BackupTierFilter, number> = {
    all: rows.length,
    daily: rows.filter((r) => r.tier === "daily").length,
    monthly: rows.filter((r) => r.tier === "monthly").length,
    permanent: rows.filter((r) => r.tier === "permanent").length,
    unverified: unverifiedCount,
  };

  return (
    <Card accent="meetingCounts">
      <div className={styles.panelHeader}>
        <Icon name="backup" size={16} className={styles.panelIcon} />
        Snapshots
        {selectedId && (
          <button
            type="button"
            className={styles.clearSelectionButton}
            onClick={() => onSelect(selectedId)}
          >
            Clear selection
          </button>
        )}
      </div>
      <div className={styles.panelSubhead}>
        {filteredRows.length} of {rows.length} snapshots · app version {latestAppVersion}
      </div>
      <div className={styles.filterChips}>
        {FILTER_ORDER.map((f) => {
          const count = filterCounts[f];
          const attention = f === "unverified" && count > 0;
          return (
            <button
              key={f}
              type="button"
              className={`${styles.filterChip} ${
                filter === f ? styles.filterChipActive : attention ? styles.filterChipAttention : ""
              }`}
              aria-pressed={filter === f}
              onClick={() => onFilterChange(f)}
            >
              {FILTER_LABEL[f]} {count}
            </button>
          );
        })}
      </div>
      {filteredRows.length === 0 ? (
        <div className={styles.emptyState}>No snapshots match this filter.</div>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.radioCell}></th>
                  <th>Created</th>
                  <th>Tier</th>
                  <th>Size</th>
                  <th>
                    <span className={styles.thLabel}>
                      Verified
                      <div className={styles.legendAnchor} data-verified-legend>
                        <button
                          ref={infoButtonRef}
                          type="button"
                          className={styles.infoButton}
                          aria-label="What does Verified mean?"
                          aria-expanded={legendOpen}
                          onClick={() => setLegendOpen((open) => !open)}
                        >
                          <Icon name="warning-circle" size={20} />
                        </button>
                        {legendOpen && legendPosition && createPortal(
                          <div
                            className={styles.legendPopover}
                            style={{ top: legendPosition.top, left: legendPosition.left, width: legendPosition.width }}
                            data-verified-legend-popup="true"
                          >
                            <div className={styles.legendPopoverTitle}>Verified</div>
                            <div className={styles.legendTable}>
                              {VERIFIED_LEGEND.map((entry) => (
                                <React.Fragment key={entry.label}>
                                  <div className={styles.legendPillCell}>
                                    <span className={`${styles.verifiedIndicator} ${styles[entry.colorClass]}`}>
                                      <Icon name={entry.icon} size={16} />
                                      {entry.label}
                                    </span>
                                  </div>
                                  <div className={styles.legendDescCell}>{entry.description}</div>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>,
                          document.body,
                        )}
                      </div>
                    </span>
                  </th>
                  <th>Replicas</th>
                  <th>Expires</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <SnapshotRow
                    key={row.id}
                    row={row}
                    selected={row.id === selectedId}
                    onSelect={onSelect}
                    onDownload={onDownload}
                    now={now}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.paginationBar}>
            <div className={styles.paginationInfo}>
              {rangeStart}-{rangeEnd} of {filteredRows.length}
            </div>
            <div className={styles.paginationControls}>
              <button
                className={styles.pageButton}
                aria-label="Previous page"
                disabled={clampedPage === 0}
                onClick={() => onPageChange(clampedPage - 1)}
              >
                <Icon name="drop-up-arrow" size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={`${styles.pageButton} ${i === clampedPage ? styles.pageButtonActive : ""}`}
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === clampedPage ? "page" : undefined}
                  onClick={() => onPageChange(i)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                className={styles.pageButton}
                aria-label="Next page"
                disabled={clampedPage >= totalPages - 1}
                onClick={() => onPageChange(clampedPage + 1)}
              >
                <Icon name="drop-down-arrow" size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

export default SnapshotsCard;

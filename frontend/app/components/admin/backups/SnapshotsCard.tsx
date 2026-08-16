"use client";

import React from "react";
import Icon from "../../ui/displays/Icon";
import Card from "../shared/Card";
import CardHeader from "../shared/CardHeader";
import type { BackupListRow, BackupReplica, BackupTier } from "../../../../types/backups";
import { ALL_BACKUP_REPLICAS } from "../../../../types/backups";
import { formatETLongDateTime } from "../../../../util/date/timeUtils";
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

const SOURCE_LABEL: Record<BackupListRow["source"], string> = {
  automatic: "Automatic",
  manual: "Manual",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const DOWNLOAD_TOOLTIP =
  "Downloads the encrypted .dump.age artifact. Requires the offline age private key to decrypt -- unusable on its own.";

/** Human-readable size (e.g. "4.2 MB", "512 KB") -- no shared formatter exists yet in util/. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** "N days" / "today" / "N days ago" for an expiry instant, relative to `now`. */
function formatExpiresIn(expiresAt: string, now: Date): string {
  const diffDays = Math.round((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS);
  // Deletion is a background sweep that can lag eligibility -- a past expiresAt is a
  // real state ("eligible, not yet swept"), not the same as expiring today.
  if (diffDays < 0) return "expired";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day";
  return `${diffDays} days`;
}

const PAGE_SIZE = 10;

interface SnapshotsCardProps {
  rows: BackupListRow[];
  /** Single-select: which row id (if any) drives the Restore Runbook card below. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  onDownload: (id: string) => void;
  /** Reference instant for "Expires in" -- passed in, never read from Date.now() here. */
  now: Date;
}

interface SnapshotRowProps {
  row: BackupListRow;
  selected: boolean;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
  now: Date;
}

const SnapshotRow: React.FC<SnapshotRowProps> = ({ row, selected, onSelect, onDownload, now }) => (
  <tr
    className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
    onClick={() => onSelect(row.id)}
  >
    <td className={styles.checkboxCell} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Select snapshot from ${formatETLongDateTime(new Date(row.createdAt))}`}
        onChange={() => onSelect(row.id)}
      />
    </td>
    <td className={styles.dateCell}>{formatETLongDateTime(new Date(row.createdAt))}</td>
    <td>
      <span className={`${styles.tierPill} ${TIER_CLASS[row.tier]}`}>{TIER_LABEL[row.tier]}</span>
    </td>
    <td className={styles.sourceBadge}>{SOURCE_LABEL[row.source]}</td>
    <td className={styles.sizeCell}>{formatSize(row.sizeBytes)}</td>
    <td className={styles.versionCell}>{row.appVersion}</td>
    <td>
      <span className={`${styles.verifiedIndicator} ${row.verified ? styles.verifiedYes : styles.verifiedNo}`}>
        <Icon name={row.verified ? "check" : "warning-circle"} size={14} />
        {row.verified ? "Verified" : "Unverified"}
      </span>
    </td>
    <td>
      <span className={styles.replicaDots}>
        {ALL_BACKUP_REPLICAS.map((replica) => {
          const present = row.replicas.includes(replica);
          return (
            <span
              key={replica}
              className={`${styles.replicaDot} ${present ? "" : styles.replicaDotMissing}`}
              title={present ? `Present in ${REPLICA_LABEL[replica]}` : `Missing from ${REPLICA_LABEL[replica]}`}
            />
          );
        })}
      </span>
    </td>
    <td className={styles.expiresCell}>
      {row.expiresAt ? (
        formatExpiresIn(row.expiresAt, now)
      ) : (
        <span className={styles.expiresNever}>never</span>
      )}
    </td>
    <td onClick={(e) => e.stopPropagation()}>
      <button
        className={styles.downloadButton}
        title={DOWNLOAD_TOOLTIP}
        aria-label={`Download encrypted snapshot from ${formatETLongDateTime(new Date(row.createdAt))}`}
        onClick={() => onDownload(row.id)}
      >
        <Icon name="backup" size={14} />
        Download (encrypted)
      </button>
    </td>
  </tr>
);

/**
 * Snapshots table -- pure presentational, all state (rows/selection/paging) owned by the
 * parent tab. Single-select checkbox drives the Restore Runbook card; onDownload fires a
 * stub handler in this PR (no real file transfer -- see the tooltip and label wording).
 */
const SnapshotsCard: React.FC<SnapshotsCardProps> = ({
  rows,
  selectedId,
  onSelect,
  page,
  onPageChange,
  onDownload,
  now,
}) => {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(rows.length, clampedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <Card>
      <CardHeader icon={<Icon name="backup" size={16} />} title={`Snapshots (${rows.length})`} />
      {rows.length === 0 ? (
        <div className={styles.emptyState}>No snapshots yet.</div>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkboxCell}></th>
                  <th>Created</th>
                  <th>Tier</th>
                  <th>Source</th>
                  <th>Size</th>
                  <th>App version</th>
                  <th>Verified</th>
                  <th>Replicas</th>
                  <th>Expires in</th>
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
              {rangeStart}-{rangeEnd} of {rows.length}
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

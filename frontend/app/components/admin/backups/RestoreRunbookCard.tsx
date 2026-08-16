"use client";

import { useState } from "react";
import type { BackupListRow } from "../../../../types/backups";
import { formatETDateString, formatETLongDateTime, formatETTime } from "../../../../util/date/timeUtils";
import Card from "../shared/Card";
import Icon from "../../ui/displays/Icon";
import styles from "./BackupsTab.module.scss";

export interface RestoreRunbookCardProps {
  /** The currently selected Snapshots row, or null when nothing is selected. */
  selected: BackupListRow | null;
  /** Reference instant for the command box's created-label -- passed in, never read from Date.now() here. */
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS_48_MS = 48 * 60 * 60 * 1000;

// Mirrors SnapshotsCard's Created-column label so the command box's header reads the same
// way the row it was generated from does ("Today, 3:17 AM" etc.) -- kept local rather than
// imported since SnapshotsCard doesn't export it and this is presentational-only.
function formatCreatedLabel(createdAt: string, now: Date): string {
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

/**
 * Break-glass restore runbook. Deliberately presentational and non-destructive: there is no
 * restore endpoint and never will be (see Part 1 of the Backups admin tab plan) — a Vercel
 * route cannot decrypt an offline-key `.dump.age` artifact. This card only surfaces the
 * prerequisites and a copy-pasteable `restore-db.sh` invocation for a human to run out-of-band.
 */
export default function RestoreRunbookCard({ selected, now }: RestoreRunbookCardProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // `id` is already `backup-<yyyymmddThhmmssZ>` — the artifact filename is that plus the
  // `.dump.age` extension (mirrors mockBackups.ts#artifactFileName without importing a
  // fixture-only module into a real component). RESTORE_TARGET_URL is required (the script
  // hard-requires a target) and the artifact path is local (./) since it must already be
  // downloaded before this command can run.
  const command = selected
    ? `AGE_IDENTITY_FILE=/path/to/key RESTORE_TARGET_URL=<neon-branch-url> ./frontend/scripts/restore-db.sh ./${selected.id}.dump.age`
    : null;
  const createdLabel = selected ? formatCreatedLabel(selected.createdAt, now) : null;

  const handleCopy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permissions can be denied/unavailable outside a secure or user-gesture
      // context -- keep the button un-flipped and tell the operator to select the text by hand.
      setCopied(false);
      setCopyFailed(true);
    }
  };

  return (
    <Card accent="suspended">
      <div className={styles.panelHeader}>Restore Runbook</div>
      <div className={styles.panelSubhead}>
        Restoring is a deliberate, out-of-band operation — never a button in this app.
      </div>

      <div className={styles.panelSubhead}>BEFORE YOU START, YOU NEED</div>
      <ul className={styles.runbookPrereqs}>
        <li className={styles.runbookPrereq}>
          <span>1.</span>
          <span>An <code>age</code> private key (holder A or B).</span>
        </li>
        <li className={styles.runbookPrereq}>
          <span>2.</span>
          <span>Direct access to the Neon production project.</span>
        </li>
        <li className={styles.runbookPrereq}>
          <span>3.</span>
          <span>A scratch Neon branch connection string, unpooled — the script refuses <code>-pooler</code> URLs.</span>
        </li>
      </ul>

      <div className={styles.panelSubhead}>
        Full steps:{" "}
        <a
          className={styles.docsLink}
          href="/docs/02-handoff/backups-and-recovery#the-break-glass-restore-runbook"
        >
          Backups and Recovery
        </a>
        .
      </div>

      {selected && command ? (
        <div className={styles.commandBox}>
          <div className={styles.commandBoxHeader}>Command for the selected snapshot · {createdLabel}</div>
          <pre className={styles.commandBoxCode}>{command}</pre>
          <button
            type="button"
            className={`${styles.commandCopyButton} ${copied ? styles.commandCopyButtonCopied : ""}`}
            onClick={handleCopy}
            aria-label="Copy command"
            title={copyFailed ? "Copy failed — select the text manually" : undefined}
          >
            <Icon name={copied ? "check" : "copy"} size="sm" />
          </button>
        </div>
      ) : (
        <div className={styles.runbookNoSelection}>Select a snapshot above to generate its restore command.</div>
      )}
    </Card>
  );
}

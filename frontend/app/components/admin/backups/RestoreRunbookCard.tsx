"use client";

import { useState } from "react";
import type { BackupListRow } from "../../../../types/backups";
import Card from "../shared/Card";
import styles from "./BackupsTab.module.scss";

export interface RestoreRunbookCardProps {
  /** The currently selected Snapshots row, or null when nothing is selected. */
  selected: BackupListRow | null;
}

/**
 * Break-glass restore runbook. Deliberately presentational and non-destructive: there is no
 * restore endpoint and never will be (see Part 1 of the Backups admin tab plan) — a Vercel
 * route cannot decrypt an offline-key `.dump.age` artifact. This card only surfaces the
 * prerequisites and a copy-pasteable `restore-db.sh` invocation for a human to run out-of-band.
 */
export default function RestoreRunbookCard({ selected }: RestoreRunbookCardProps) {
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
    <Card>
      <div className={styles.panelHeader}>Restore Runbook</div>
      <div className={styles.panelSubhead}>
        Restoring is a deliberate, out-of-band operation — not a button in this app.
      </div>

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
        Full steps: docs/02-handoff/backups-and-recovery.md (break-glass runbook).
      </div>

      {selected && command ? (
        <div className={styles.runbookCommandBox}>
          <pre className={styles.runbookCommand}>{command}</pre>
          <button
            type="button"
            className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ""}`}
            onClick={handleCopy}
            aria-label="Copy restore command"
            title={copyFailed ? "Copy failed — select the text manually" : undefined}
          >
            {copied ? "Copied" : copyFailed ? "Copy failed" : "Copy"}
          </button>
        </div>
      ) : (
        <div className={styles.runbookNoSelection}>Select a snapshot above to generate its restore command.</div>
      )}
    </Card>
  );
}

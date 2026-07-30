"use client";

import React, { useState } from "react";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CardHeader from "./CardHeader";
import StatusPill, { StatusPillVariant } from "../atoms/StatusPill";
import styles from "../../../styles/components/admin/ImportTab.module.scss";

type ImportStatus = "created" | "conflict" | "skipped" | "errored";

interface ImportResultRow {
  meeting: string;
  status: ImportStatus;
  note?: string;
}

const STATUS_ORDER: ImportStatus[] = ["created", "conflict", "skipped", "errored"];

const STATUS_LABEL: Record<ImportStatus, string> = {
  created: "✓ Created",
  conflict: "⚠ Created with conflict",
  skipped: "⊘ Skipped",
  errored: "✕ Errored",
};

const STATUS_VARIANT: Record<ImportStatus, StatusPillVariant> = {
  created: "success",
  conflict: "warning",
  skipped: "neutral",
  errored: "error",
};

// Stands in for a parsed spreadsheet so the Results UI can be reviewed before the
// real endpoint exists — replace with the POST /api/import/meetings response in Ticket B.
const MOCK_RESULTS: ImportResultRow[] = [
  { meeting: "Serenity Fellowship", status: "created" },
  { meeting: "Seeds of Hope Group", status: "created" },
  { meeting: "Unity Big Book Study", status: "conflict", note: "conflicts with Unity Fellowship (Tue 7PM)" },
  { meeting: "Gratitude Group", status: "created" },
  { meeting: "Acceptance Speaker Meeting", status: "skipped", note: "already exists (matched by title + schedule)" },
  { meeting: "—", status: "errored", note: "invalid email" },
  { meeting: "Improvement Step Study", status: "created" },
];

const formatMeetingId = (index: number) => `M${String(index + 1).padStart(3, "0")}`;

const ImportTab: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResultRow[] | null>(null);

  const chooseFile = (next: File | null) => {
    setFile(next);
    setResults(null);
  };

  const handleImport = () => {
    if (!file) return;
    setImporting(true);
    setResults(null);
    // TODO (Import XLSX): replace this timeout with a real POST /api/import/meetings call.
    setTimeout(() => {
      setResults(MOCK_RESULTS);
      setImporting(false);
    }, 800);
  };

  const counts = results && STATUS_ORDER.reduce((acc, status) => {
    acc[status] = results.filter((r) => r.status === status).length;
    return acc;
  }, {} as Record<ImportStatus, number>);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <CardHeader icon={<UploadFileIcon />} title="Import Meetings (XLSX)" />
        <div className={styles.cardDesc}>
          Upload a spreadsheet of meetings to add them all at once. A preview of the result will be shown.
        </div>
        <div
          className={`${styles.dropzoneRow} ${dragOver ? styles.dropzoneActive : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.[0]) chooseFile(e.dataTransfer.files[0]);
          }}
        >
          {file ? (
            <span>{file.name}</span>
          ) : (
            <span>
              Drop file here or{" "}
              <label className={styles.chooseFile}>
                Choose File
                <input
                  data-testid="import-file-input"
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </span>
          )}
          <button data-testid="import-upload-button" className={styles.uploadButton} onClick={handleImport} disabled={!file || importing}>
            {importing ? "Importing…" : "Upload & Import"}
          </button>
        </div>
      </div>

      {results && counts && (
        <div className={styles.card}>
          <div className={styles.resultsHeader}>Results: {results.length} rows processed</div>
          <div className={styles.pillRow}>
            {STATUS_ORDER.map((status) => (
              <StatusPill key={status} variant={STATUS_VARIANT[status]}>
                {STATUS_LABEL[status]} ({counts[status]})
              </StatusPill>
            ))}
          </div>
          <table className={styles.resultsTable} data-testid="import-results-table">
            <thead>
              <tr>
                <th>Meeting ID</th>
                <th>Meeting</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} data-testid={`import-result-row-${i}`}>
                  <td>{formatMeetingId(i)}</td>
                  <td>{r.meeting}</td>
                  <td>
                    <StatusPill variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
                    {r.note && <div className={styles.resultNote}>{r.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ImportTab;

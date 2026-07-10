"use client";

import React, { useState } from "react";
import styles from "../../../styles/components/organisms/ImportTab.module.scss";

// Shell only — wired to POST /api/import/meetings in Ticket B.
const ImportTab: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.sectionLabel}>UPLOAD</div>
        <div
          className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
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
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </span>
          )}
        </div>
        <button className={styles.uploadButton} disabled={!file}>
          Upload &amp; Import
        </button>
      </div>
    </div>
  );
};

export default ImportTab;

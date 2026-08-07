"use client";

import React from "react";
import styles from "../../../../styles/components/admin/DiagnosticsTab.module.scss";

interface DiagnosticsCardErrorProps {
  message: string;
  onRetry: () => void;
}

// Shared error-state body for every Diagnostics card -- previously an error just rendered as
// a dead-end message with no way to recover short of a full page reload.
const DiagnosticsCardError: React.FC<DiagnosticsCardErrorProps> = ({ message, onRetry }) => (
  <div className={styles.emptyState}>
    {message}{" "}
    <button type="button" className={styles.retryButton} onClick={onRetry}>
      Retry
    </button>
  </div>
);

export default DiagnosticsCardError;

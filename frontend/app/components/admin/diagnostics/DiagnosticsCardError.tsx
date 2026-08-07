"use client";

import React, { useState } from "react";
import styles from "../../../../styles/components/admin/DiagnosticsTab.module.scss";

interface DiagnosticsCardErrorProps {
  message: string;
  onRetry: () => void | Promise<void>;
}

// Shared error-state body for every Diagnostics card -- previously an error just rendered as
// a dead-end message with no way to recover short of a full page reload. Tracks its own
// pending state (every caller's onRetry is its own `load`, an async function) and disables the
// button while it's in flight, so a fast double-click can't fire two overlapping retries.
const DiagnosticsCardError: React.FC<DiagnosticsCardErrorProps> = ({ message, onRetry }) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={styles.emptyState}>
      {message}{" "}
      <button type="button" className={styles.retryButton} onClick={handleRetry} disabled={retrying}>
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
};

export default DiagnosticsCardError;

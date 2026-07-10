"use client";

import React from "react";
import styles from "../../../styles/components/organisms/ExportTab.module.scss";

// Placeholder — full XLSX/lease-CSV export UI is built in Ticket B.1 step 6.
const ExportTab: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.sectionLabel}>EXPORT</div>
        <div className={styles.emptyState}>Coming soon.</div>
      </div>
    </div>
  );
};

export default ExportTab;

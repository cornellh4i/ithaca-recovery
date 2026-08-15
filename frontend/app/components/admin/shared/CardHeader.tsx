"use client";

import React from "react";
import styles from "./CardHeader.module.scss";

interface CardHeaderAction {
  label: string;
  onClick: () => void;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
}

interface CardHeaderProps {
  icon: React.ReactNode;
  title: string;
  action?: CardHeaderAction;
}

const CardHeader: React.FC<CardHeaderProps> = ({ icon, title, action }) => (
  <div className={styles.cardHeader}>
    <span className={styles.cardIcon}>{icon}</span>
    <div className={styles.cardTitle}>{title}</div>
    {action && (
      <button
        className={styles.configureButton}
        aria-label={action.ariaLabel}
        title={action.title ?? action.ariaLabel}
        onClick={action.onClick}
        disabled={action.disabled}
      >
        {action.label}
      </button>
    )}
  </div>
);

export default CardHeader;

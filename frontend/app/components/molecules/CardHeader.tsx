"use client";

import React from "react";
import styles from "../../../styles/components/molecules/CardHeader.module.scss";

interface CardHeaderAction {
  icon: React.ReactNode;
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
        className={styles.menuButton}
        aria-label={action.ariaLabel}
        title={action.title ?? action.ariaLabel}
        onClick={action.onClick}
        disabled={action.disabled}
      >
        {action.icon}
      </button>
    )}
  </div>
);

export default CardHeader;

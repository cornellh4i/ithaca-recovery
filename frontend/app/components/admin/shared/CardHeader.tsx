"use client";

import React from "react";
import styles from "../../../../styles/components/admin/CardHeader.module.scss";

interface CardHeaderAction {
  // Icon-only kebab-style button when `icon` is set; a labeled brand-pink button when `label`
  // is set instead. A kebab implies a menu of choices -- when a card only ever has exactly one
  // action (e.g. "Configure"), a labeled button is the honest affordance, not a kebab hiding one
  // item.
  icon?: React.ReactNode;
  label?: string;
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
        className={action.label ? styles.configureButton : styles.menuButton}
        aria-label={action.ariaLabel}
        title={action.title ?? action.ariaLabel}
        onClick={action.onClick}
        disabled={action.disabled}
      >
        {action.label ?? action.icon}
      </button>
    )}
  </div>
);

export default CardHeader;

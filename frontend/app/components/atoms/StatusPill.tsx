import React from "react";
import styles from "../../../styles/components/atoms/StatusPill.module.scss";

export type StatusPillVariant = "success" | "warning" | "neutral" | "error";

const VARIANT_CLASS: Record<StatusPillVariant, string> = {
  success: styles.success,
  warning: styles.warning,
  neutral: styles.neutral,
  error: styles.error,
};

interface StatusPillProps {
  variant: StatusPillVariant;
  children: React.ReactNode;
}

const StatusPill: React.FC<StatusPillProps> = ({ variant, children }) => (
  <span className={`${styles.pill} ${VARIANT_CLASS[variant]}`}>{children}</span>
);

export default StatusPill;

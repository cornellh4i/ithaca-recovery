import React from "react";
import styles from "../../../styles/components/atoms/StatCounter.module.scss";

interface StatCounterProps {
  value: number | string;
  label: string;
  variant?: "default" | "warning";
}

const StatCounter: React.FC<StatCounterProps> = ({ value, label, variant = "default" }) => (
  <div className={styles.block}>
    <div className={`${styles.number} ${variant === "warning" ? styles.warning : ""}`}>{value}</div>
    <div className={styles.caption}>{label}</div>
  </div>
);

export default StatCounter;

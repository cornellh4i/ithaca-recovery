import React from "react";
import styles from "./StatCounter.module.scss";

interface StatCounterProps {
  value: number | string;
  label: string;
  variant?: "default" | "navy";
}

const StatCounter: React.FC<StatCounterProps> = ({ value, label, variant = "default" }) => (
  <div className={styles.block}>
    <div className={`${styles.number} ${variant === "navy" ? styles.navy : ""}`}>{value}</div>
    <div className={styles.caption}>{label}</div>
  </div>
);

export default StatCounter;

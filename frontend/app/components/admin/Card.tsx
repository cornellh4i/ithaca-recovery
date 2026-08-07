"use client";

import React from "react";
import styles from "../../../styles/components/admin/Card.module.scss";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

const Card: React.FC<CardProps> = ({ children, className, "data-testid": testId }) => (
  <div className={`${styles.card} ${className ?? ""}`} data-testid={testId}>
    {children}
  </div>
);

export default Card;

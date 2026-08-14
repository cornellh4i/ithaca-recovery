"use client";

import React from "react";
import LabeledCheckbox from "../ui/inputs/CheckBox";
import styles from "../../../styles/components/shared/FilterGroup.module.scss";

export interface FilterGroupItem {
  key: string;
  label: string;
  color: string;
}

interface FilterGroupProps {
  title: string;
  items: FilterGroupItem[];
  checked: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
  // "caption" (default) is small uppercase label; "title" is a bigger,
  // bolder heading for contexts like the calendar sidebar.
  headingVariant?: "caption" | "title";
}

const FilterGroup: React.FC<FilterGroupProps> = ({ title, items, checked, onToggle, headingVariant = "caption" }) => {
  const allOn = items.every((item) => checked[item.key]);
  const labelClass = headingVariant === "title" ? styles.titleLabel : styles.captionLabel;
  const groupClass = headingVariant === "title" ? `${styles.group} ${styles.groupSpaced}` : styles.group;

  return (
    <div className={groupClass}>
      <div className={styles.header}>
        <span className={labelClass}>{title}</span>
        <button
          type="button"
          className={styles.selectAllToggle}
          onClick={() => items.forEach((item) => onToggle(item.key, !allOn))}
        >
          {allOn ? "Clear all" : "Select all"}
        </button>
      </div>

      {items.map((item) => (
        <div key={item.key} className={styles.coloredRow}>
          <LabeledCheckbox
            label={item.label}
            checked={!!checked[item.key]}
            onChange={(e) => onToggle(item.key, e.target.checked)}
            color={item.color}
          />
        </div>
      ))}
    </div>
  );
};

export default FilterGroup;

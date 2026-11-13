"use client";

import { THEME_LABELS, THEME_PREFERENCES } from "../../../util/common/theme";
import { useThemePreference } from "../../../hooks/useThemePreference";
import styles from "./ThemeOptions.module.scss";

// Mobile sidebar control: an explicit three-option row -- the slide-out has room for labels,
// so every state is visible at once instead of hidden behind a cycling icon.
export default function ThemeOptions() {
  const [preference, setPreference] = useThemePreference();
  return (
    <div className={styles.container}>
      <span id="theme-options-label" className={styles.label}>
        Theme
      </span>
      <div role="radiogroup" aria-labelledby="theme-options-label" className={styles.options}>
        {THEME_PREFERENCES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={preference === option}
            className={`${styles.option} ${preference === option ? styles.selected : ""}`}
            onClick={() => setPreference(option)}
          >
            {THEME_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

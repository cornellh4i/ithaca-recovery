"use client";

import { THEME_LABELS, nextThemePreference } from "../../../util/common/theme";
import { useThemePreference } from "../../../hooks/useThemePreference";
import Icon from "../ui/displays/Icon";
import Tooltip from "../ui/overlays/Tooltip";
import styles from "./ThemeToggle.module.scss";

const ICONS = { light: "theme-light", dark: "theme-dark", system: "theme-system" } as const;

// Desktop navbar control: one icon button that cycles Light -> Dark -> System. Lives in the
// navbar itself, not the ProfileCard popup, so signed-out viewers get it too.
export default function ThemeToggle() {
  const [preference, setPreference] = useThemePreference();
  const next = nextThemePreference(preference);
  return (
    <Tooltip content={`Theme: ${THEME_LABELS[preference]}`} align="right">
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setPreference(next)}
        aria-label={`Theme: ${THEME_LABELS[preference]}. Switch to ${THEME_LABELS[next]}.`}
        data-testid="theme-toggle"
        data-theme-preference={preference}
      >
        <Icon name={ICONS[preference]} />
      </button>
    </Tooltip>
  );
}

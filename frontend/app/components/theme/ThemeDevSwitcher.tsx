"use client";

import { THEME_SWITCHING_ENABLED, nextThemePreference, type ThemePreference } from "../../../util/common/theme";
import { useThemePreference } from "../../../hooks/useThemePreference";
import styles from "./ThemeDevSwitcher.module.scss";

const LABELS: Record<ThemePreference, string> = { light: "Light", dark: "Dark", system: "System" };

// Development-only stand-in for the real toggle (GitHub #467 replaces it) so the dark-mode
// tickets can be built and checked. Cycles Light -> Dark -> System. Lives in the desktop navbar's
// right cluster (where the real toggle goes), not floating -- a fixed overlay sat on top of the
// mobile FAB and swallowed its clicks.
export default function ThemeDevSwitcher() {
  if (!THEME_SWITCHING_ENABLED) return null;
  return <Switcher />;
}

function Switcher() {
  const [preference, setPreference] = useThemePreference();
  return (
    <button
      type="button"
      className={styles.switcher}
      onClick={() => setPreference(nextThemePreference(preference))}
      data-testid="theme-dev-switcher"
    >
      Theme: {LABELS[preference]} <span className={styles.devTag}>dev</span>
    </button>
  );
}

// No UI: keeps the stored theme applied on layouts/viewports that don't render the switcher
// (mobile nav, /login). See useThemePreference for why that needs a component at all.
export function ThemeSync() {
  if (!THEME_SWITCHING_ENABLED) return null;
  return <Sync />;
}

function Sync() {
  useThemePreference();
  return null;
}

// Theme preference plumbing shared by the root layouts' pre-paint script and the theme toggle.
// The palettes themselves live in styles/theme.scss.
//
// Three viewer states: "light" / "dark" stamp data-theme on <html> and persist to localStorage;
// "system" removes both and lets theme.scss's prefers-color-scheme block decide.

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "icr-theme";

// Toggle cycle order: Light -> Dark -> System -> Light.
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}

// localStorage throws outright in some privacy modes and sandboxed frames -- a missing or
// unreadable preference is just "system".
export function readThemePreference(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeThemePreference(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = globalThis.localStorage,
): void {
  try {
    if (preference === "system") storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted; the choice still applies for this page view.
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  root: Pick<Element, "setAttribute" | "removeAttribute"> = document.documentElement,
): void {
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

// Runs synchronously in <head> during HTML parsing, before first paint -- after hydration would
// be too late to avoid a flash. Must stay self-contained ES5 (it's inlined as a string, not
// bundled) and must agree with readThemePreference/applyThemePreference above.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

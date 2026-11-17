"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  readThemePreference,
  storeThemePreference,
  type ThemePreference,
} from "../util/common/theme";

// Same-tab changes don't fire the "storage" event, so setters notify subscribers directly.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed the preference -- follow it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyThemePreference(readThemePreference());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// The server can't see localStorage; hydration renders "system" first, then React re-renders
// with the stored value -- no hydration mismatch.
const serverSnapshot = (): ThemePreference => "system";

export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, () => readThemePreference(), serverSnapshot);

  // Re-applies the stamp ThemeScript set in <head>: Strict Mode's dev-only remount resets <html>
  // to its JSX-managed attributes, which drops data-theme. No-op otherwise.
  useLayoutEffect(() => {
    applyThemePreference(readThemePreference());
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    storeThemePreference(next);
    applyThemePreference(next);
    listeners.forEach((listener) => listener());
  }, []);

  return [preference, setPreference];
}

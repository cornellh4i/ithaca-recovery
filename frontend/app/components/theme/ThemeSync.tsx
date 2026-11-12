"use client";

import { useThemePreference } from "../../../hooks/useThemePreference";

// No UI: keeps the stored theme applied on layouts/viewports that don't render a theme control
// (/login, the mobile nav until its drawer opens). See useThemePreference for why that needs a
// mounted component at all.
export default function ThemeSync() {
  useThemePreference();
  return null;
}

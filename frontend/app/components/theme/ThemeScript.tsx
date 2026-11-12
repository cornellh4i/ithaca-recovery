import { THEME_INIT_SCRIPT, THEME_SWITCHING_ENABLED } from "../../../util/common/theme";

// Pre-paint theme stamp for a root layout's <head> (see util/common/theme.ts). Renders nothing
// while theme switching is gated off -- the layout pins data-theme="light" itself then.
//
// type flips to text/plain on the client so React doesn't warn about rendering a <script> (it
// would never execute there anyway); suppressHydrationWarning covers that mismatch. Pattern
// from Next's "preventing flash before hydration" guide.
export default function ThemeScript() {
  if (!THEME_SWITCHING_ENABLED) return null;
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}

// The <html> data-theme attribute a root layout should server-render: pinned to light while
// switching is gated off, otherwise left for ThemeScript to stamp.
export const SERVER_THEME_ATTRIBUTE: "light" | undefined = THEME_SWITCHING_ENABLED ? undefined : "light";

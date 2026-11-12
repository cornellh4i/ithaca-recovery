import { THEME_INIT_SCRIPT } from "../../../util/common/theme";

// Pre-paint theme stamp for a root layout's <head> (see util/common/theme.ts).
//
// type flips to text/plain on the client so React doesn't warn about rendering a <script> (it
// would never execute there anyway); suppressHydrationWarning covers that mismatch. Pattern
// from Next's "preventing flash before hydration" guide.
export default function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}

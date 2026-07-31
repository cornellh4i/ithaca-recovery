import { useEffect, useState } from "react";
import { PHONE_BREAKPOINT } from "../util/breakpoints";

// Boolean, not callback-based like useBreakpoint -- there's no expand/collapse analog for
// phone width, every consumer just needs to branch its own JSX on "am I phone, yes/no".
// Starts false (SSR-safe, avoids a hydration mismatch); consumers on a real phone tolerate
// a one-frame flash of the desktop layout before this flips true, same tradeoff already
// accepted by isAdmin: null elsewhere in this app.
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(width <= ${PHONE_BREAKPOINT}px)`);
    const update = () => setIsPhone(mql.matches);

    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isPhone;
}

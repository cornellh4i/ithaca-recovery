import { useEffect, useLayoutEffect, useState } from "react";
import { PHONE_BREAKPOINT } from "../util/breakpoints";

// useLayoutEffect on the client (flips isPhone before the browser paints) but useEffect
// during SSR, where useLayoutEffect would otherwise log "does nothing on the server" -- this
// component tree is still server-rendered even though it's a client component (Next's hybrid
// rendering), so that warning is real, not hypothetical.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// null means "not yet known" (no window on the server, and the client hasn't measured yet),
// same three-state convention as isAdmin: boolean | null elsewhere in this app -- callers
// should render nothing (not silently fall through to the desktop branch) while it's null, or
// a real phone would flash the desktop layout for the brief window before this resolves.
// Boolean beyond that (not callback-based like useBreakpoint) -- there's no expand/collapse
// analog for phone width, every consumer just needs to branch its own JSX on "am I phone".
export function useIsPhone(): boolean | null {
  const [isPhone, setIsPhone] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    const mql = window.matchMedia(`(width <= ${PHONE_BREAKPOINT}px)`);
    const update = () => setIsPhone(mql.matches);

    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isPhone;
}

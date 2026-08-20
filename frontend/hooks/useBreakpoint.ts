import { useEffect } from "react";
import { SIDEBAR_EXPAND_BREAKPOINT, SIDEBAR_YIELD_BREAKPOINT } from "../util/common/breakpoints";

type Zone = "narrow" | "between" | "wide";

const zoneOf = (width: number): Zone =>
  width < SIDEBAR_YIELD_BREAKPOINT ? "narrow" : width >= SIDEBAR_EXPAND_BREAKPOINT ? "wide" : "between";

// Auto-collapses the sidebar the moment the window narrows past the point where the full
// sidebar and an unscrolled week no longer fit side by side — the sidebar yields before the
// calendar starts scrolling horizontally. Edge-triggered with hysteresis: collapse fires on
// entering the narrow zone, expand on entering the wide zone, and nothing fires while moving
// within or into the band between the two edges — so a manual toggle there is never fought,
// and repeated resizes inside one zone are no-op.
export function useBreakpoint(collapseSidebar: () => void, expandSidebar: () => void): void {
  useEffect(() => {
    let zone = zoneOf(window.innerWidth);
    if (zone === "narrow") {
      collapseSidebar();
    }

    const handleResize = () => {
      const nextZone = zoneOf(window.innerWidth);
      if (nextZone === zone) return;
      if (nextZone === "narrow") {
        collapseSidebar();
      } else if (nextZone === "wide") {
        expandSidebar();
      }
      zone = nextZone;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapseSidebar, expandSidebar]);
}

import { useEffect } from "react";
import { TABLET_BREAKPOINT } from "../util/common/breakpoints";

// Auto-collapses the sidebar the moment the window narrows past the tablet breakpoint.
// One-way trigger: it only ever calls collapseSidebar() on a downward crossing, never
// fights a manual expandSidebar() afterward (e.g. widening back past the threshold does
// not auto re-expand, and narrowing again while already compact is a no-op call).
export function useBreakpoint(collapseSidebar: () => void, expandSidebar: () => void): void {
  useEffect(() => {
    let wasAboveThreshold = window.innerWidth >= TABLET_BREAKPOINT;
    if (!wasAboveThreshold) {  
      collapseSidebar();  
    }  

    const handleResize = () => {
      const isAboveThreshold = window.innerWidth >= TABLET_BREAKPOINT;
      if (wasAboveThreshold && !isAboveThreshold) {
        collapseSidebar();
      } else if (!wasAboveThreshold && isAboveThreshold) {
        expandSidebar();
      }
      wasAboveThreshold = isAboveThreshold;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapseSidebar]);
}

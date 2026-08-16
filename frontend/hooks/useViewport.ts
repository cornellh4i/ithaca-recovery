import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PHONE_BREAKPOINT, TABLET_BREAKPOINT } from "../util/common/breakpoints";

// useLayoutEffect on the client (flips viewport before the browser paints) but useEffect
// during SSR, where useLayoutEffect would otherwise log "does nothing on the server" -- this
// component tree is still server-rendered even though it's a client component (Next's hybrid
// rendering), so that warning is real, not hypothetical. Exported so other client-rendered
// hooks with the same SSR/CSR split (e.g. useDialogBehavior) share one definition instead of
// each re-deriving the same ternary.
export const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type Device = "phone" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";

export interface Viewport {
  device: Device;
  orientation: Orientation;
  width: number;
  height: number;
  // True from the moment a resize/orientationchange event fires until the debounced
  // re-measurement below settles. A phone rotating (or resizing across the phone/tablet
  // breakpoint) reports its new physical dimensions to the browser well before this hook's own
  // (debounced) re-render catches up -- without this flag, a consumer swapping between
  // differently-shaped layouts (e.g. page.tsx's portrait/landscape mobile views) would render
  // the *old* layout, squeezed into the *new* dimensions, for that whole window. A consumer can
  // check this to render a blank buffer instead until the real swap is ready.
  isTransitioning: boolean;
}

// A small delay before recomputing on resize/orientationchange -- both fire repeatedly
// mid-gesture (a drag-resize, a device rotation's intermediate frames), and recomputing on
// every one of those is wasted work for a value nothing needs faster than "settled".
const RESIZE_DEBOUNCE_MS = 150;

// Device is decided by the *smaller* viewport dimension, not by width -- a phone in
// landscape (e.g. 844x390) still measures as "phone" (min=390), matching PHONE_BREAKPOINT,
// rather than falling through to "desktop" the way a plain width check would.
const measure = (): Omit<Viewport, "isTransitioning"> => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const min = Math.min(width, height);
  const device: Device = min <= PHONE_BREAKPOINT ? "phone" : min <= TABLET_BREAKPOINT ? "tablet" : "desktop";
  const orientation: Orientation = width > height ? "landscape" : "portrait";
  return { device, orientation, width, height };
};

// null means "not yet known" (no window on the server, and the client hasn't measured yet),
// same three-state convention useIsPhone used -- callers should render nothing (not silently
// fall through to a default branch) while it's null, or a real phone would flash the wrong
// layout for the brief window before this resolves.
export function useViewport(): Viewport | null {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    // Synchronous on mount (and on every resize/orientationchange) -- only the *update*
    // firing is debounced, so first paint is never delayed waiting for a timer.
    setViewport({ ...measure(), isTransitioning: false });

    const scheduleUpdate = () => {
      // Flips to transitioning immediately (synchronously, on the very first event of a
      // resize/rotation) -- only the actual re-measurement below is debounced, so a consumer
      // rendering a blank buffer on this flag reacts right away, not 150ms late.
      setViewport((prev) => (prev ? { ...prev, isTransitioning: true } : prev));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setViewport({ ...measure(), isTransitioning: false });
      }, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return viewport;
}

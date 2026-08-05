import { useLayoutEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

// Tracks an element's live clientWidth/clientHeight via ResizeObserver -- used by the
// phone-landscape calendar views, which size their grid dynamically off the available
// viewport instead of a fixed pixel constant (DayLandscapeView's room-row height fits exactly
// to the available height, reacting live as MobileAppNavbar hides/shows on scroll; see
// useElementWidth.ts for the width-only case built on top of this).
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, ElementSize] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

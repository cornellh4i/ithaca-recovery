import { useLayoutEffect, useRef, useState } from "react";

// Tracks an element's live clientWidth via ResizeObserver -- used by the phone-landscape
// calendar views (DayLandscapeView's hour-column width, MultiDayLandscapeView's day count),
// both of which size their grid dynamically off the available viewport width instead of a
// fixed pixel constant.
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setWidth(el.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

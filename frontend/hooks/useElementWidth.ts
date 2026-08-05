import { useElementSize } from "./useElementSize";

// Width-only convenience wrapper over useElementSize -- used by MultiDayLandscapeView, which
// only ever needs its measured width (day count/column width), not height.
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const [ref, size] = useElementSize<T>();
  return [ref, size.width];
}

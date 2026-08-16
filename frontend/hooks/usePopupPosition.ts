import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

// Fixed popup width; kept in sync with ViewMeeting.module.scss's .meetingDetails width.
export const POPUP_WIDTH = 380;
const POPUP_MARGIN = 8;
const ANCHOR_GAP = 12;

export interface PopupPosition {
  top: number;
  left: number;
}

export interface UsePopupPositionResult {
  popupRef: RefObject<HTMLDivElement | null>;
  popupPosition: PopupPosition | null;
}

// Tracks a position:fixed, portaled popup's on-screen position beside `anchorEl` -- e.g.
// ViewMeeting's desktop popup, anchored beside the calendar box that was clicked. Recomputes
// on scroll (capture:true catches scrolling within any nested scroll container, not just the
// window, but skips scrolling inside the popup's own content -- the anchor box hasn't moved,
// so recomputing there would just churn popupPosition with an equivalent-but-new object) and
// resize.
export function usePopupPosition(anchorEl: HTMLElement | null): UsePopupPositionResult {
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);

  // Before the popup has ever mounted, popupRef.current is null, so the first calculation
  // below falls back to a capped estimate (min(80% of viewport, 600px)) for its height --
  // real popups are usually much shorter (e.g. ~350-400px for a non-recurring meeting with
  // no description), so that estimate over-clamps `top` upward far more than necessary,
  // landing the popup well away from the anchor box that was actually clicked. The
  // useLayoutEffect below corrects this once the real height is known post-mount.
  const updatePosition = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.right + ANCHOR_GAP;
    if (left + POPUP_WIDTH > window.innerWidth - POPUP_MARGIN) {
      left = rect.left - POPUP_WIDTH - ANCHOR_GAP;
    }
    left = Math.max(POPUP_MARGIN, Math.min(left, window.innerWidth - POPUP_WIDTH - POPUP_MARGIN));
    // Clamp against the popup's own (measured, or capped-height-estimated pre-mount) height --
    // window.innerHeight alone is the viewport's bottom edge, not the popup's, so an anchor low
    // in the day grid would otherwise render the popup mostly off-screen.
    const popupHeight = popupRef.current?.offsetHeight ?? Math.min(0.8 * window.innerHeight, 600);
    const top = Math.max(POPUP_MARGIN, Math.min(rect.top, window.innerHeight - popupHeight - POPUP_MARGIN));
    setPopupPosition({ top, left });
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl) return;

    const handleScroll = (event: Event) => {
      if (popupRef.current?.contains(event.target as Node)) return;
      updatePosition();
    };

    updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorEl, updatePosition]);

  // Runs once the popup's real DOM node exists (right after the first render above sets
  // popupPosition and the portal actually mounts) and corrects `top` using its real
  // offsetHeight in place of the pre-mount estimate -- see the comment on updatePosition.
  useLayoutEffect(() => {
    if (!popupPosition || !popupRef.current) return;
    updatePosition();
    // Deliberately excludes updatePosition/popupPosition to run only on the transition to
    // mounted, not on every position update updatePosition itself causes (which would still
    // be harmless/idempotent, just redundant).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!popupPosition]);

  return { popupRef, popupPosition };
}

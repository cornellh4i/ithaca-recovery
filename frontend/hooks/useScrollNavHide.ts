import { useCallback, useRef } from "react";
import { useCalendarContext } from "../app/context/CalendarProvider";

// A small downward/upward scroll delta before toggling nav visibility, so tiny scroll
// jitter (e.g. rubber-banding at the top) doesn't flicker the navbar in and out.
const SCROLL_HIDE_THRESHOLD_PX = 4;

// Hides/shows MobileAppNavbar in response to vertical scroll inside a phone calendar view's
// own scroll container -- shared by DayPortraitView and MultiDayLandscapeView so both read
// "scrolled down -> hide, scrolled up -> show" the same way, with the same rubber-band-
// overscroll guard. DayLandscapeView deliberately doesn't use this -- its dual-axis (hour +
// room) scroll made the gesture ambiguous and unreliable on real mobile browsers, so its
// navbar just always stays visible.
export function useScrollNavHide() {
  const { setNavHidden } = useCalendarContext();
  const lastScrollTopRef = useRef(0);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const el = event.currentTarget;

      // Rubber-band overscroll (elastic bounce past the top/bottom edge) reports scrollTop
      // outside [0, maxScroll] and snaps back next frame, producing a delta spike in the
      // opposite direction of the actual scroll -- ignore nav show/hide while overscrolled.
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (el.scrollTop < 0 || el.scrollTop > maxScroll) {
        lastScrollTopRef.current = Math.min(Math.max(el.scrollTop, 0), maxScroll);
        return;
      }

      const delta = el.scrollTop - lastScrollTopRef.current;
      if (delta > SCROLL_HIDE_THRESHOLD_PX) {
        setNavHidden(true);
      } else if (delta < -SCROLL_HIDE_THRESHOLD_PX) {
        setNavHidden(false);
      }
      lastScrollTopRef.current = el.scrollTop;
    },
    [setNavHidden]
  );

  // Call after any programmatic scrollTop jump (e.g. a scroll-to-current-time on mount) so
  // handleScroll's next delta calculation doesn't misread that jump as a user scroll-down
  // and hide the nav the instant the view mounts.
  const syncScrollAnchor = useCallback((scrollTop: number) => {
    lastScrollTopRef.current = scrollTop;
  }, []);

  return { handleScroll, syncScrollAnchor };
}

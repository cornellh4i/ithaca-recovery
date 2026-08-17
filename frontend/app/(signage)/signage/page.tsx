"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "../../components/ui/displays/Logo";
import CalendarNavbar from "../../components/calendar/desktop/CalendarNavbar";
import DayView from "../../components/calendar/desktop/DayView";
import WeekView from "../../components/calendar/desktop/WeekView";
import { parseSignageFilters, parseSignageView } from "../../../util/filters/signageFilters";
import { formatETDateString } from "../../../util/date/timeUtils";
import { getSwipeDirection, type SwipeDirection } from "../../../util/date/dateTransition";
import { useViewport } from "../../../hooks/useViewport";
import navbarStyles from "../../components/navigation/AppNavigation.module.scss";

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const MIDNIGHT_CHECK_INTERVAL_MS = 30 * 1000;

export default function SignagePage() {
  return (
    <Suspense fallback={null}>
      <SignageContent />
    </Suspense>
  );
}

function SignageContent() {
  const router = useRouter();
  const viewport = useViewport();

  // Signage is a lobby/TV board with no purpose on a handset (no nav chrome, large type,
  // auto-refresh) and a layout that breaks under 480px -- redirect to the main calendar
  // instead of rendering it. Replace, not push, so Back doesn't bounce into a redirect loop.
  // Re-checked whenever useViewport recomputes (its own resize/orientationchange listener),
  // so rotating a phone into landscape while already on signage still redirects.
  useEffect(() => {
    if (viewport?.device === "phone") {
      router.replace("/");
    }
  }, [viewport, router]);

  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseSignageFilters(searchParams),
    [searchParams]
  );
  // Seeded once from the URL; passed to CalendarNavbar as its controlled selectedView (see that
  // component's own comment), so a touch-enabled kiosk's dropdown still works via onViewChange
  // -- it's the same navbar the interactive app uses, just no longer owning this state itself.
  const [view, setView] = useState<'Day' | 'Week'>(() => parseSignageView(searchParams));

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Local mirror of CalendarProvider's changeSelectedDate -- signage has no CalendarProvider
  // ancestor (see DayView/WeekView/CalendarNavbar's transitionDirection prop comments), so it
  // can't read transitionDirection from context, but a touch-enabled kiosk still deserves a
  // correctly-directioned transition rather than always sliding "forward" regardless of which
  // arrow was pressed. Ref (not state) for the "previous" value, same reason CalendarProvider
  // uses one: changeSelectedDate's identity must stay stable across date changes.
  const [transitionDirection, setTransitionDirection] = useState<SwipeDirection>("forward");
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);
  const changeSelectedDate = useCallback((newDate: Date) => {
    setTransitionDirection(getSwipeDirection(selectedDateRef.current, newDate));
    setSelectedDate(newDate);
  }, []);

  // A callback ref (stored in state), not a plain useRef -- a plain ref's populated value
  // isn't reactive, so on first mount (viewport still null, page renders null) the element
  // stays permanently absent from this effect's closure with no re-run ever triggered once it
  // actually attaches. Storing it in state makes attachment itself a dependency change.
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  // Week's internal scroll-to-current-time needs a flex-column ancestor with a *bounded*
  // height (see WeekView.module.scss's .outerContainer comment) -- contentEl is otherwise a
  // plain unbounded block, so WeekView's own overflow:auto container never actually overflows
  // and its scrollTop assignment silently no-ops. Only set for Week: Day's height-based scale
  // branch below depends on contentEl growing to its full natural (unbounded) height so
  // contentEl.scrollHeight reflects real, unclipped content size.
  const [weekContentHeight, setWeekContentHeight] = useState<number | undefined>(undefined);

  // Scale the whole page (header + calendar) together as one unit.
  // Day's timeline runs horizontally, so it scales to fit height.
  // Week's timeline runs downward, so it scales to fit width.
  useLayoutEffect(() => {
    if (!contentEl) return;

    const recalcScale = () => {
      if (view === "Day") {
        if (contentEl.scrollHeight > 0) setScale(window.innerHeight / contentEl.scrollHeight);
      } else if (contentEl.scrollWidth > 0) {
        // scrollWidth reflects the natural (horizontally unclipped) width of contentEl's
        // descendants regardless of contentEl's own height -- bounding that height below
        // doesn't feed back into this measurement.
        const newScale = window.innerWidth / contentEl.scrollWidth;
        setScale(newScale);
        if (newScale > 0) setWeekContentHeight(window.innerHeight / newScale);
      }
    };

    recalcScale();
    const observer = new ResizeObserver(recalcScale);
    observer.observe(contentEl);
    window.addEventListener("resize", recalcScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recalcScale);
    };
  }, [view, filters, contentEl]);

  useEffect(() => {
    const id = setInterval(() => setRefreshTrigger(prev => prev + 1), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      // ET calendar date, not toDateString() — rolls over at ET midnight regardless of the kiosk's OS timezone.
      // Reads selectedDateRef (not selectedDate) so this effect's own identity stays stable
      // across date changes, same reason CalendarProvider's changeSelectedDate uses a ref.
      if (formatETDateString(now) !== formatETDateString(selectedDateRef.current)) {
        changeSelectedDate(now);
      }
    }, MIDNIGHT_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [changeSelectedDate]);

  const viewProps = {
    filters,
    selectedDate,
    setSelectedDate: changeSelectedDate,
    selectedMeetingID: null, // signage is read-only, nothing is ever selected
    setSelectedMeetingID: () => {}, // no-op: signage is read-only
    setSelectedNewMeeting: () => {}, // no-op: signage is read-only
    setAnchorEl: () => {}, // no-op: signage is read-only
    refreshTrigger,
    transitionDirection,
  };

  // Renders nothing while viewport is unresolved (avoids a flash of the desktop board before
  // the first measurement) and once it resolves to phone (the redirect above is already in
  // flight) -- same null-during-resolution convention as page.tsx's own isPhone guard.
  if (viewport === null || viewport.device === "phone") {
    return null;
  }

  return (
    // Always hidden -- the page itself must never be the scroller (that was the bug: with
    // Week's overflow:auto here, the page silently absorbed the scroll WeekView's own
    // scrollToCurrentTime meant to perform). Day never needed page-level scroll either
    // (its own timeline scrolls horizontally within contentEl).
    <div style={{ height: "100vh", overflow: "hidden" }}>
      <div
        ref={setContentEl}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${100 / scale}%`,
          // Bounding contentEl to a flex column with an explicit height gives WeekView's
          // .outerContainer (flex: 1 1 auto; min-height: 0) a real ancestor to resolve
          // against, mirroring the main app's .primaryCalendar (page.module.scss). Day is
          // left unbounded (height: auto) -- see recalcScale's comment above.
          ...(view === "Week"
            ? { display: "flex", flexDirection: "column" as const, height: weekContentHeight }
            : undefined),
        }}
      >
        <div className={navbarStyles.navbar}>
          <div className={navbarStyles.navcontainer}>
            <Logo />
          </div>
        </div>
        <CalendarNavbar
          selectedDate={selectedDate}
          onDateChange={changeSelectedDate}
          selectedView={view}
          onViewChange={(v) => setView(v === "Week" ? "Week" : "Day")}
          transitionDirection={transitionDirection}
        />
        {view === "Day" ? <DayView {...viewProps} /> : <WeekView {...viewProps} />}
      </div>
    </div>
  );
}

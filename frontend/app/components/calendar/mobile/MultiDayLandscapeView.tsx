import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls, useDragControls, type PanInfo } from "motion/react";
import styles from "./MultiDayLandscapeView.module.scss";
import DayColumn from "../shared/DayColumn";
import { filterMeetingsForDate, MeetingFilters } from "../../../../util/filters/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../../../util/rooms/filterColors";
import { formatETDateString, formatETWeekdayShort, getCurrentETMinutesSinceMidnight } from "../../../../util/date/timeUtils";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../../util/meetings/meetingOverlapLayout";
import { addDaysToDate, daysBetweenET } from "../../../../util/date/weekDates";
import { useRangeMeetings } from "../../../../hooks/useRangeMeetings";
import { useElementWidth } from "../../../../hooks/useElementWidth";
import { useScrollNavHide } from "../../../../hooks/useScrollNavHide";
import TopLoadingBar from "../../ui/displays/TopLoadingBar";

type Meeting = OverlapMeeting;

// A day column needs at least this much width to stay legible at the compact tier (room +
// title, per BoxText's tier table) -- the day count below is derived from how many of these
// actually fit the measured width, generalizing WeekView's fixed 7-day week into an
// arbitrary-width "page". Never fewer than 1 (a very narrow width still shows something) or
// more than 7 (a wide tablet lands back on a familiar week).
const MIN_DAY_WIDTH = 150;
const MAX_DAYS = 7;
// Portrait's 60px scaled down further -- this view trades some per-hour legibility for
// headroom to show the day header row above each column within a short landscape viewport.
const MULTIDAY_HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Matches .dayHeader's own height (module.scss) so the time column's hour labels line up
// with the meeting grid below the day headers, not the headers themselves.
const TIME_HEADER_SPACER = 22;
const TIME_COLUMN_WIDTH = 32;
// Velocity-only fling gate -- WeekStrip/DayPortraitView's own thresholds also OR in a 60px
// offset, but at typical column widths (150px+) that offset alone trips before a deliberate
// slow drag ever clears half a column, so every drag past ~40px would fling a full page
// regardless of how slowly it was dragged. Velocity alone reliably tells a fast flick (full
// page) apart from a slow, deliberate drag (rounds to the nearest day instead, below).
const SWIPE_VELOCITY_THRESHOLD = 400;
const SETTLE_TRANSITION = { type: "tween" as const, duration: 0.2, ease: [0.2, 0.8, 0.3, 1] as [number, number, number, number] };

const formatDayName = (date: Date): string => formatETWeekdayShort(date).toUpperCase();
const formatDateNumber = (date: Date): string => formatETDateString(date).split("-")[2].replace(/^0/, "");
const isDateToday = (date: Date): boolean => formatETDateString(date) === formatETDateString(new Date());
const formatHour = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour}${period}`;
};

interface MultiDayLandscapeViewProps {
  filters: MeetingFilters;
  selectedDate: Date;
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  selectedOccurrenceDate?: Date | null;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
  setLastClickedDate?: (date: Date) => void;
  refreshTrigger?: number;
  scrollLocked?: boolean;
  conflictMids?: Set<string>;
  syncErrorMids?: Set<string>;
}

// Landscape phone's generalized week: a "page" of `days` consecutive dates, `days` itself
// derived from measured width rather than fixed at 7. Renders 3 pages back-to-back (prev/
// current/next, same infinite-carousel trick DayPortraitView's single-day version uses) and
// drags horizontally between them -- a fling advances a full page, a slower drag shifts by
// however many days the drag distance actually covers.
const MultiDayLandscapeView: React.FC<MultiDayLandscapeViewProps> = ({
  filters,
  selectedDate,
  selectedMeetingID,
  setSelectedMeetingID,
  selectedOccurrenceDate,
  setSelectedNewMeeting,
  setAnchorEl,
  setLastClickedDate,
  refreshTrigger = 0,
  scrollLocked = false,
  conflictMids,
  syncErrorMids,
}) => {
  // Two different refs: scrollAreaRef is the vertical-scroll container (unaffected by the
  // time column's width); stripWrapperRef measures only the space actually left for day
  // panels once the fixed-width time column has taken its share -- using scrollArea's own
  // (wider) width here would size every day panel too wide, overflowing past stripWrapper.
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [stripWrapperRef, viewportWidth] = useElementWidth<HTMLDivElement>();
  const { handleScroll, syncScrollAnchor } = useScrollNavHide();
  const days = viewportWidth > 0 ? Math.min(Math.max(Math.floor(viewportWidth / MIN_DAY_WIDTH), 1), MAX_DAYS) : 1;
  const colWidth = viewportWidth > 0 ? viewportWidth / days : 0;
  const panelWidth = days * colWidth;

  const [pageStart, setPageStart] = useState<Date>(() => selectedDate);
  // Derived state during render, same pattern WeekView uses for weekStartDate -- recompute
  // pageStart only when selectedDate actually moves outside the current page. `days` changing
  // on its own (a resize/rotation) does NOT re-center: the page keeps its start date and just
  // grows/shrinks how many days it shows (see the design plan's "State" note).
  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);
  if (selectedDate !== prevSelectedDate) {
    setPrevSelectedDate(selectedDate);
    const offset = daysBetweenET(pageStart, selectedDate);
    if (offset < 0 || offset >= days) {
      setPageStart(selectedDate);
    }
  }

  const pageStartRef = useRef(pageStart);
  useEffect(() => {
    pageStartRef.current = pageStart;
  }, [pageStart]);

  // The visible strip spans 3 pages (prev/current/next) = 3*days dates, from pageStart-days
  // to pageStart+2*days-1. Fetches exactly those 3 `days`-sized windows -- not whole ET weeks
  // around them (useRangeMeetings, unlike useWeekMeetings, isn't week-aligned), so a 4-day page
  // fetches 12 days total, not up to 4 whole weeks' worth just because each window's anchor
  // date happened to land in a different one.
  const prevPageStart = addDaysToDate(pageStart, -days);
  const nextPageStart = addDaysToDate(pageStart, days);
  const { meetings: rangeA } = useRangeMeetings(prevPageStart, days, refreshTrigger);
  // Only the current (center) page's own loading state drives the loading bar -- A/C are
  // background prefetches for swipe-adjacent pages, and the currently-visible page can be
  // fully ready even while a neighbor is still in flight.
  const { meetings: rangeB, isLoading } = useRangeMeetings(pageStart, days, refreshTrigger);
  const { meetings: rangeC } = useRangeMeetings(nextPageStart, days, refreshTrigger);

  const allMeetings = useMemo(() => {
    // Keyed on id+date, not id alone -- a recurring meeting occurring more than once across
    // the 3 fetched pages shares its id across every occurrence (each with its own .date), and
    // an id-only key would silently collapse them down to just one, dropping the rest.
    const merged = new Map<string, Meeting>();
    for (const meeting of rangeA) merged.set(`${meeting.id}-${meeting.date}`, meeting);
    for (const meeting of rangeB) merged.set(`${meeting.id}-${meeting.date}`, meeting);
    for (const meeting of rangeC) merged.set(`${meeting.id}-${meeting.date}`, meeting);
    return Array.from(merged.values());
  }, [rangeA, rangeB, rangeC]);

  const getRoomColor = (meeting: Meeting) => {
    if (meeting.tags.includes("Remote")) return REMOTE_COLOR;
    return ROOM_COLORS[meeting.room] ?? ZOOM_ROOM_COLOR;
  };

  const meetingsForDate = useCallback(
    (date: Date) =>
      layoutOverlappingMeetings(filterMeetingsForDate(allMeetings, date, filters)).map((meeting) => ({
        ...meeting,
        primaryColor: getRoomColor(meeting),
        overflowMeetings: meeting.overflowMeetings?.map((m) => ({ ...m, primaryColor: getRoomColor(m) })),
      })),
    [allMeetings, filters]
  );

  const columnDates = useMemo(
    () => Array.from({ length: 3 * days }, (_, i) => addDaysToDate(pageStart, i - days)),
    [pageStart, days]
  );

  // Top offset (from the day panel's own top, above its .dayHeader) of the current-time line
  // -- rendered per-panel below, only in whichever panel is actually today (see renderDayPanel).
  const [currentTimePosition, setCurrentTimePosition] = useState<number | null>(null);
  const updateTimePosition = useCallback(() => {
    const minutesSinceMidnight = getCurrentETMinutesSinceMidnight();
    setCurrentTimePosition(TIME_HEADER_SPACER + (minutesSinceMidnight / 60) * MULTIDAY_HOUR_HEIGHT);
  }, []);
  useEffect(() => {
    updateTimePosition();
    const intervalId = setInterval(updateTimePosition, 60000);
    return () => clearInterval(intervalId);
  }, [updateTimePosition]);

  // Same first-scroll flash guard every other calendar view here already has -- runs once ever
  // (mount only), not on every page change (a drag-paging shift keeps whatever vertical scroll
  // position the user's already at, it doesn't reset to "now" on every new page).
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const scrollOffset = MULTIDAY_HOUR_HEIGHT * (getCurrentETMinutesSinceMidnight() / 60) - MULTIDAY_HOUR_HEIGHT * 2;
    const clampedOffset = Math.max(0, scrollOffset);
    el.scrollTop = clampedOffset;
    // Keeps handleScroll's own delta calculation from seeing this programmatic jump as a
    // user scroll-down and hiding the mobile navbar the instant this view mounts.
    syncScrollAnchor(clampedOffset);
    setInitialScrollDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const controls = useAnimationControls();
  // Set by handleDragEnd right before its own setPageStart call -- lets the recentering effect
  // below tell "this pageStart change was already animated by the drag settle" apart from any
  // other trigger (the navbar's prev/next arrows, a mini-calendar pick that lands outside the
  // page, etc.), which still needs its own animation.
  const isDragCommitRef = useRef(false);
  const prevPageStartForAnimRef = useRef(pageStart);
  useLayoutEffect(() => {
    const fromPageStart = prevPageStartForAnimRef.current;
    prevPageStartForAnimRef.current = pageStart;

    if (isDragCommitRef.current) {
      isDragCommitRef.current = false;
      controls.set({ x: -panelWidth });
      return;
    }

    // A one-page external shift (currently only the navbar's prev/next arrows, which move
    // selectedDate by exactly `days`) -- animate the same slide a swipe-fling would produce
    // instead of snapping instantly. columnDates already reflects the new pageStart by now, so
    // the *old* current page is sitting at whichever slot the shift landed it on (index 0 if
    // we moved forward a page, index 2 if backward) -- jump there first (the same pixels
    // already on screen, so invisible) then animate to the new resting center, mirroring
    // handleDragEnd's own fling settle. Anything else (a resize-only change, or a jump that
    // doesn't land on a clean one-page shift) just snaps -- there's no single "old" panel slot
    // to animate from in those cases.
    const dayDelta = daysBetweenET(fromPageStart, pageStart);
    if (Math.abs(dayDelta) === days) {
      const forward = dayDelta > 0;
      controls.set({ x: forward ? 0 : -2 * panelWidth });
      controls.start({ x: -panelWidth }, SETTLE_TRANSITION);
    } else {
      controls.set({ x: -panelWidth });
    }
  }, [panelWidth, formatETDateString(pageStart), controls, days]);

  const dragControls = useDragControls();
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragControls.start(event);
  };

  const isDraggingRef = useRef(false);
  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleDragEnd = async (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const dx = info.offset.x;
    const isFling = Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    const forward = dx < 0;
    // Rounds to the *nearest* day, not just however many whole days the drag cleared -- past
    // the halfway point of a column, release should already commit to the next day rather
    // than snapping back to the one you started on (e.g. days 8-11, dragged half a column
    // left, releases onto 10-13, not back to 8-11 or all the way to 12-15).
    const magnitude = isFling ? days : (colWidth > 0 ? Math.min(Math.round(Math.abs(dx) / colWidth), days) : 0);
    const shift = magnitude === 0 ? 0 : (forward ? magnitude : -magnitude);

    if (shift === 0) {
      controls.start({ x: -panelWidth }, SETTLE_TRANSITION);
      return;
    }

    await controls.start({ x: -(days + shift) * colWidth }, SETTLE_TRANSITION);
    if (!mountedRef.current) return;
    isDragCommitRef.current = true;
    setPageStart(addDaysToDate(pageStartRef.current, shift));
    controls.set({ x: -panelWidth });
  };

  const renderDayPanel = (date: Date) => {
    const dayMeetings = meetingsForDate(date);
    return (
      // Keyed by the panel's own ET date, not its position -- columnDates shifts by `shift`
      // days on every page commit, so an index-based key would let React reuse a panel's
      // subtree (and DayColumn's own instance state, e.g. an open overflow popup) across a
      // date change instead of remounting it for the new day.
      <div key={formatETDateString(date)} className={styles.dayPanel} style={{ width: colWidth }}>
        <div className={`${styles.dayHeader} ${isDateToday(date) ? styles.today : ""}`}>
          <span className={styles.dayName}>{formatDayName(date)}</span> {formatDateNumber(date)}
        </div>
        <DayColumn
          roomColor={ZOOM_ROOM_COLOR} // Unused fallback: every meeting sets primaryColor via getRoomColor
          meetings={dayMeetings}
          selectedMeetingID={selectedMeetingID}
          setSelectedMeetingID={setSelectedMeetingID}
          selectedOccurrenceDate={selectedOccurrenceDate}
          setSelectedNewMeeting={setSelectedNewMeeting}
          setAnchorEl={setAnchorEl}
          columnDate={date}
          setLastClickedDate={setLastClickedDate}
          conflictMids={conflictMids}
          syncErrorMids={syncErrorMids}
          hourHeight={MULTIDAY_HOUR_HEIGHT}
          hideTags
          tier="compact"
        />
        {isDateToday(date) && currentTimePosition !== null && (
          <div className={styles.currentTimeIndicator} style={{ top: currentTimePosition }} />
        )}
      </div>
    );
  };

  return (
    <div className={styles.outerContainer}>
      <TopLoadingBar active={isLoading} label="Loading meetings" />
      <div
        className={styles.scrollArea}
        ref={scrollAreaRef}
        onScroll={handleScroll}
        style={{
          ...(scrollLocked ? { overflow: "hidden" } : undefined),
          visibility: initialScrollDone ? "visible" : "hidden",
        }}
      >
        <div className={styles.row}>
          <div className={styles.timeColumn} style={{ width: TIME_COLUMN_WIDTH }}>
            <div className={styles.timeSpacer} style={{ height: TIME_HEADER_SPACER }} />
            {HOURS.map((hour) => (
              <div key={hour} className={styles.hourLabel} style={{ height: MULTIDAY_HOUR_HEIGHT }}>
                {formatHour(hour)}
              </div>
            ))}
          </div>
          <div className={styles.stripWrapper} ref={stripWrapperRef} onPointerDown={handlePointerDown}>
            <motion.div
              className={styles.strip}
              drag="x"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ left: -2 * panelWidth, right: 0 }}
              // 1, not a fraction -- the constraint bounds are just this render window's edge
              // (only 3 pages are ever mounted), not a meaningful UX boundary the way the start/
              // end of a real list would be. Any resistance below 1 means an ordinary swipe
              // (easily longer than one panel-width on a narrow phone) starts visibly pulling
              // back *before* release, reading as the view snapping early. The real, deliberate
              // snap-to-nearest-day only ever happens in handleDragEnd, strictly on release --
              // full elasticity here just removes the live tug that preceded it.
              dragElastic={1}
              // handleDragEnd already owns the post-release animation (it computes and commits
              // its own settle via controls.start()) -- framer-motion's default built-in
              // momentum/inertia decay would otherwise start animating the same x value at the
              // same time, the two fighting each other and reading as heavy, resistant drag.
              dragMomentum={false}
              animate={controls}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onClickCapture={(e) => {
                if (isDraggingRef.current) {
                  e.stopPropagation();
                  isDraggingRef.current = false;
                }
              }}
              style={{ touchAction: "pan-y", width: 3 * panelWidth }}
            >
              {columnDates.map((date) => renderDayPanel(date))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiDayLandscapeView;

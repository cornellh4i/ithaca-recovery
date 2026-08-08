import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls, useDragControls, type PanInfo } from "framer-motion";
import WeekStrip from "./WeekStrip";
import CalendarHeader from "../shared/CalendarHeader";
import DayColumn from "../shared/DayColumn";
import { filterMeetingsForDate, MeetingFilters } from "../../../../util/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../../../util/rooms/filterColors";
import { formatETDateString } from "../../../../util/date/timeUtils";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../../util/meetingOverlapLayout";
import { getFirstDayOfWeek, addDaysToDate } from "../../../../util/date/weekDates";
import { useWeekMeetings } from "../../../../hooks/useWeekMeetings";
import { useScrollNavHide } from "../../../../hooks/useScrollNavHide";
import { useCalendarContext } from "../../../context/CalendarProvider";
import TopLoadingBar from "../../atoms/TopLoadingBar";
import styles from "../../../../styles/components/calendar/mobile/DayPortraitView.module.scss";

interface Meeting extends OverlapMeeting {
  syncError?: boolean;
}

// Mobile shows up to 3 overlapping meetings side by side before folding into a "+N"
// indicator, vs. desktop WeekView's default of 2 (see util/meetingOverlapLayout.ts).
const MOBILE_MAX_VISIBLE_OVERLAP = 3;

// Half of DayColumn's 120px/hour desktop default -- deliberately trades detail for fitting
// more of the day on screen at once (see .timeColumn/.timeSlot/.dayPanel below, which must
// stay in sync with this), and DayColumn's tag row is dropped entirely to make the shorter
// rows workable (see BoxText's hideTags).
const MOBILE_HOUR_HEIGHT = 60;

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

// Distance/velocity a horizontal drag on the carousel track needs to clear before it counts
// as a real "swipe to the next/previous day" gesture -- matches WeekStrip's own thresholds so
// both gesture surfaces feel consistent.
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 400;

interface DayPortraitViewProps {
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
  isAdmin: boolean | null;
}

const isDateToday = (date: Date): boolean => formatETDateString(date) === formatETDateString(new Date());

// Mobile portrait day view: WeekStrip + CalendarHeader stay in place (plain flex siblings
// above the scroll area, not competing for the same scroll container DayColumn uses) while
// DayColumn's own wrapper scrolls independently underneath -- also where the mobile navbar's
// scroll-hide listener attaches (writes navHidden to CalendarProvider, read by
// MobileAppNavbar). CalendarHeader's heading has its own independent tween (fires when the
// date change commits, same as WeekStrip taps/mini-calendar picks) -- it is not unified into
// the carousel drag below.
const DayPortraitView: React.FC<DayPortraitViewProps> = ({
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
  isAdmin,
}) => {
  const { changeSelectedDate, transitionDirection, transitionAlreadyAnimatedByCaller } =
    useCalendarContext();
  const { handleScroll, syncScrollAnchor } = useScrollNavHide();

  // A prev/current/next-day carousel needs whichever week(s) contain selectedDate - 1 and
  // selectedDate + 1 -- these two always cover all 3 target dates, since selectedDate is
  // always adjacent to both. In the common (non-boundary) case both calls target the same
  // week; useWeekMeetings' underlying cache dedupes concurrent same-key fetches, so this is
  // still exactly one network request.
  const prevDate = addDaysToDate(selectedDate, -1);
  const nextDate = addDaysToDate(selectedDate, 1);
  const { meetings: prevWeekMeetings, isLoading: prevLoading } = useWeekMeetings(getFirstDayOfWeek(prevDate), refreshTrigger);
  const { meetings: nextWeekMeetings, isLoading: nextLoading } = useWeekMeetings(getFirstDayOfWeek(nextDate), refreshTrigger);
  const isLoading = prevLoading || nextLoading;

  const allMeetings = useMemo(() => {
    // Keyed on id+date, not id alone -- a recurring meeting occurring more than once in the
    // fetched range shares its id across every occurrence (each with its own .date), and an
    // id-only key would silently collapse them down to just one, dropping the rest.
    const merged = new Map<string, Meeting>();
    for (const meeting of prevWeekMeetings) merged.set(`${meeting.id}-${meeting.date}`, meeting);
    for (const meeting of nextWeekMeetings) merged.set(`${meeting.id}-${meeting.date}`, meeting);
    return Array.from(merged.values());
  }, [prevWeekMeetings, nextWeekMeetings]);

  const getRoomColor = (meeting: Meeting) => {
    if (meeting.tags.includes("Remote")) return REMOTE_COLOR;
    return ROOM_COLORS[meeting.room] ?? ZOOM_ROOM_COLOR;
  };

  const computeDayMeetings = useCallback(
    (all: Meeting[], date: Date) => {
      const filtered = filterMeetingsForDate(all, date, filters);
      return layoutOverlappingMeetings(filtered, MOBILE_MAX_VISIBLE_OVERLAP).map((meeting) => ({
        ...meeting,
        primaryColor: getRoomColor(meeting),
        overflowMeetings: meeting.overflowMeetings?.map((m) => ({ ...m, primaryColor: getRoomColor(m) })),
      }));
    },
    [filters]
  );

  const prevMeetings = useMemo(
    () => computeDayMeetings(allMeetings, prevDate),
    [allMeetings, prevDate, computeDayMeetings]
  );
  const currentMeetings = useMemo(
    () => computeDayMeetings(allMeetings, selectedDate),
    [allMeetings, selectedDate, computeDayMeetings]
  );
  const nextMeetings = useMemo(
    () => computeDayMeetings(allMeetings, nextDate),
    [allMeetings, nextDate, computeDayMeetings]
  );

  const selectedEtDateStr = formatETDateString(selectedDate);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Gates .scrollArea's visibility until the very first scroll-to-current-time completes --
  // same flash DayView/WeekView's own scrollToCurrentTime has always had (a beat of the
  // wrong scroll position at 12 AM before JS jumps it to "now"), which useLayoutEffect alone
  // doesn't fully rule out (e.g. a slow first paint). One-way: only ever flips true once, on
  // the very first date this view renders -- later date changes (day swipe/tap/mini-calendar
  // pick) reset scroll position same as always but don't re-hide already-visible content.
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  const scrollToCurrentTime = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const now = new Date();
    const nowPositionPx = (now.getHours() * 60 + now.getMinutes()) * (MOBILE_HOUR_HEIGHT / 60);
    const scrollPosition = Math.max(0, nowPositionPx - MOBILE_HOUR_HEIGHT * 2);
    el.scrollTop = scrollPosition;
    // Keeps handleScroll's own delta calculation from seeing this programmatic jump as a
    // user scroll-down and hiding the mobile navbar the instant this view mounts.
    syncScrollAnchor(scrollPosition);
  }, [syncScrollAnchor]);

  useLayoutEffect(() => {
    if (initialScrollDone === false){
      scrollToCurrentTime();
      setInitialScrollDone(true);
    }
  }, [selectedEtDateStr, scrollToCurrentTime]);

  // dayColumnWrapper is a pure clipping viewport that never itself moves -- .carouselTrack
  // (measured in wrapperRef) is the thing that drags. Each .dayPanel bundles its own
  // .timeColumn alongside its DayColumn, so the time labels and the day's content always move
  // together as one unit during a swipe -- there's no separate fixed time strip for a gap to
  // open against, and each day reads as its own distinct panel rather than blending into the
  // one next to it.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const updateWidth = () => setPanelWidth(el.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Classic 3-panel infinite-carousel positioning: track is 3*panelWidth wide, prev panel at
  // x:0, current (resting) panel at x:-panelWidth, next panel at x:-2*panelWidth. Recentered
  // (no animation, just a position reset) whenever panelWidth or the selected date changes --
  // covers both a resize and any non-drag date change (WeekStrip tap, mini-calendar pick),
  // for which the freshly-computed prev/current/next panels should appear immediately rather
  // than mid-slide.
  const controls = useAnimationControls();
  useLayoutEffect(() => {
    controls.set({ x: -panelWidth });
  }, [panelWidth, selectedEtDateStr, controls]);

  // .carouselTrack's own drag="x" only recognizes a gesture that starts on itself. Starting
  // the drag manually from a pointerdown anywhere in .scrollArea (dragListener={false} below
  // stops .carouselTrack from also auto-starting one from its own pointerdown) reliably
  // captures a swipe starting anywhere in the row, regardless of which descendant (a
  // .timeColumn label, a meeting card, empty grid space) it began on.
  const dragControls = useDragControls();
  const handleRowPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragControls.start(event);
  };

  // Same problem WeekStrip guards against (see its isDraggingRef comment): a completed drag
  // still fires a native click on whatever element the pointer started on -- here, a meeting
  // card, which would open its popup on top of the day change. Set at drag start (recognition
  // happens well before any click could fire), cleared once a click has actually been
  // suppressed.
  const isDraggingRef = useRef(false);
  const handleTrackDragStart = () => {
    isDraggingRef.current = true;
  };

  // Mirror of selectedDate so the awaited continuation in handleTrackDragEnd reads the
  // current date rather than the one captured when the handler was created -- otherwise a
  // second swipe completing before the first tween resolves would compute from a stale date.
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);
  const mountedRef = useRef(true);
  useEffect(() => {
    // Reset (not just declare via useRef(true)) on every effect run, not only cleanup -- React
    // 18 Strict Mode's dev-only mount/cleanup/remount dance on initial mount runs this cleanup
    // once before the "real" mount settles, which would otherwise leave this stuck at false
    // forever despite the component actually being mounted (exactly what was silently no-op'ing
    // every mobile day-swipe's changeSelectedDate call).
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleTrackDragEnd = async (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const pastThreshold =
      Math.abs(info.offset.x) > SWIPE_OFFSET_THRESHOLD || Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;

    if (!pastThreshold) {
      controls.start({ x: -panelWidth }, { type: "tween", duration: 0.25, ease: "easeOut" });
      return;
    }

    // Swipe left (negative offset) = forward = later; swipe right = backward = earlier.
    const forward = info.offset.x < 0;
    // Parks the track fully on the neighbor's panel first -- since that panel's content *is*
    // what the newly recomputed "current" panel becomes once changeSelectedDate commits, the
    // recenter below is visually seamless (the standard infinite-carousel swap-while-at-the-
    // edge trick).
    await controls.start({ x: forward ? -2 * panelWidth : 0 }, { type: "tween", duration: 0.25, ease: "easeOut" });
    if (!mountedRef.current) return;
    changeSelectedDate(addDaysToDate(selectedDateRef.current, forward ? 1 : -1), { alreadyAnimatedByCaller: true });
    controls.set({ x: -panelWidth });
  };

  // Each panel bundles its own time-label column with its DayColumn so both slide as one unit
  // during a swipe (see the wrapperRef comment above) -- shared by all three panels below.
  // The inner motion.div plays CalendarHeader's own slide-in (same direction/duration, driven
  // by the same transitionDirection) so the day grid visibly moves together with the heading
  // for WeekStrip taps and mini-calendar picks -- previously only the heading animated, since a
  // drag's own pan is the only thing that ever moved this carousel. initial={false} suppresses
  // it specifically for drag-committed changes (transitionAlreadyAnimatedByCaller, set by this
  // view's own handleTrackDragEnd), where the pan gesture itself already was that motion.
  const renderDayPanel = (meetings: Meeting[], date: Date) => (
    <div className={styles.dayPanel} style={{ width: panelWidth }}>
      <div className={styles.timeColumn}>
        {timeSlots.map((time, index) => (
          <div key={index} className={styles.timeSlot}>
            {time}
          </div>
        ))}
      </div>
      <div className={styles.dayContent}>
        <motion.div
          key={formatETDateString(date)}
          initial={
            transitionAlreadyAnimatedByCaller
              ? false
              : { x: transitionDirection === "forward" ? 24 : -24, opacity: 0 }
          }
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <DayColumn
            roomColor={ZOOM_ROOM_COLOR} // Unused fallback: every meeting sets primaryColor via getRoomColor
            meetings={meetings}
            selectedMeetingID={selectedMeetingID}
            setSelectedMeetingID={setSelectedMeetingID}
            selectedOccurrenceDate={selectedOccurrenceDate}
            setSelectedNewMeeting={setSelectedNewMeeting}
            setAnchorEl={setAnchorEl}
            columnDate={date}
            setLastClickedDate={setLastClickedDate}
            conflictMids={conflictMids}
            hourHeight={MOBILE_HOUR_HEIGHT}
            hideTags
          />
        </motion.div>
        {isDateToday(date) && (
          <div
            className={styles.currentTimeIndicator}
            style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) * (MOBILE_HOUR_HEIGHT / 60)}px` }}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <TopLoadingBar active={isLoading} />
      <WeekStrip />
      <CalendarHeader
        selectedDate={selectedDate}
        selectedView="Day"
        isAdmin={isAdmin}
        animatedHeading={{ transitionKey: selectedEtDateStr, direction: transitionDirection }}
      />

      <div
        className={styles.scrollArea}
        ref={scrollAreaRef}
        onScroll={handleScroll}
        onPointerDown={handleRowPointerDown}
        style={{
          ...(scrollLocked ? { overflow: "hidden" } : undefined),
          visibility: initialScrollDone ? "visible" : "hidden",
          touchAction: "pan-y",
        }}
      >
        <div className={styles.dayColumnWrapper} ref={wrapperRef}>
          <motion.div
            className={styles.carouselTrack}
            drag="x"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ left: -2 * panelWidth, right: 0 }}
            dragElastic={0.2}
            animate={controls}
            onDragStart={handleTrackDragStart}
            onDragEnd={handleTrackDragEnd}
            onClickCapture={(e) => {
              if (isDraggingRef.current) {
                e.stopPropagation();
                isDraggingRef.current = false;
              }
            }}
            style={{ touchAction: "pan-y", width: panelWidth * 3 }}
          >
            {renderDayPanel(prevMeetings, prevDate)}
            {renderDayPanel(currentMeetings, selectedDate)}
            {renderDayPanel(nextMeetings, nextDate)}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DayPortraitView;

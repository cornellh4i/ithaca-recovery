import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls, useDragControls, type PanInfo } from "framer-motion";
import styles from "../../../../styles/components/calendar/mobile/MultiDayLandscapeView.module.scss";
import DayColumn from "../shared/DayColumn";
import { filterMeetingsForDate, MeetingFilters } from "../../../../util/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../../../util/filterColors";
import { formatETDateString } from "../../../../util/timeUtils";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../../util/meetingOverlapLayout";
import { getFirstDayOfWeek, addDaysToDate, daysBetweenET } from "../../../../util/weekDates";
import { useWeekMeetings } from "../../../../hooks/useWeekMeetings";
import { useElementWidth } from "../../../../hooks/useElementWidth";

interface Meeting extends OverlapMeeting {
  syncError?: boolean;
}

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
// Same swipe-gesture thresholds WeekStrip/DayPortraitView already use, reused here as the
// "fling" gate -- a drag past either one advances a full page; short of both, it shifts by
// however many whole days the drag distance actually covered (see handleTrackDragEnd).
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 400;
const SETTLE_TRANSITION = { type: "tween" as const, duration: 0.2, ease: [0.2, 0.8, 0.3, 1] as [number, number, number, number] };

const formatDayName = (date: Date): string =>
  date.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" }).toUpperCase();
const formatDateNumber = (date: Date): string => formatETDateString(date).split("-")[2].replace(/^0/, "");
const isDateToday = (date: Date): boolean => formatETDateString(date) === formatETDateString(new Date());

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
}) => {
  const [scrollAreaRef, viewportWidth] = useElementWidth<HTMLDivElement>();
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
  // to pageStart+2*days-1. Fetches every ET week that range touches -- always exactly 4 calls
  // (fixed, regardless of `days`) so this stays a valid hook call; useWeekMeetings' own cache
  // dedupes any of the 4 that land on the same week (see DayPortraitView's identical
  // reasoning for its prev/next pair).
  const prevPageStart = addDaysToDate(pageStart, -days);
  const nextPageStart = addDaysToDate(pageStart, days);
  const nextPageEnd = addDaysToDate(pageStart, 2 * days - 1);
  const weekA = useWeekMeetings(getFirstDayOfWeek(prevPageStart), refreshTrigger);
  const weekB = useWeekMeetings(getFirstDayOfWeek(pageStart), refreshTrigger);
  const weekC = useWeekMeetings(getFirstDayOfWeek(nextPageStart), refreshTrigger);
  const weekD = useWeekMeetings(getFirstDayOfWeek(nextPageEnd), refreshTrigger);

  const allMeetings = useMemo(() => {
    const merged = new Map<string, Meeting>();
    for (const meeting of weekA) merged.set(meeting.id, meeting);
    for (const meeting of weekB) merged.set(meeting.id, meeting);
    for (const meeting of weekC) merged.set(meeting.id, meeting);
    for (const meeting of weekD) merged.set(meeting.id, meeting);
    return Array.from(merged.values());
  }, [weekA, weekB, weekC, weekD]);

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

  // Same first-scroll flash guard every other calendar view here already has.
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const now = new Date();
    const scrollOffset = MULTIDAY_HOUR_HEIGHT * (now.getHours() + now.getMinutes() / 60) - MULTIDAY_HOUR_HEIGHT * 2;
    el.scrollTop = Math.max(0, scrollOffset);
    setInitialScrollDone(true);
    // Re-runs on pageStart change (a page-shift lands on a different set of days, but "now"
    // is still the right default vertical position), not on every days/width recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatETDateString(pageStart)]);

  const controls = useAnimationControls();
  useLayoutEffect(() => {
    controls.set({ x: -panelWidth });
    // Recentered (no animation) whenever the page or the measured width changes -- a resize
    // mid-drag never happens (drag and resize are mutually exclusive gestures), so this is
    // safe to always snap rather than tween.
  }, [panelWidth, formatETDateString(pageStart), controls]);

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
    const isFling = Math.abs(dx) > SWIPE_OFFSET_THRESHOLD || Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    const forward = dx < 0;
    const magnitude = isFling ? days : (colWidth > 0 ? Math.floor(Math.abs(dx) / colWidth) : 0);
    const shift = magnitude === 0 ? 0 : (forward ? magnitude : -magnitude);

    if (shift === 0) {
      controls.start({ x: -panelWidth }, SETTLE_TRANSITION);
      return;
    }

    await controls.start({ x: -(days + shift) * colWidth }, SETTLE_TRANSITION);
    if (!mountedRef.current) return;
    setPageStart(addDaysToDate(pageStartRef.current, shift));
    controls.set({ x: -panelWidth });
  };

  const renderDayPanel = (date: Date, index: number) => {
    const dayMeetings = meetingsForDate(date);
    return (
      <div key={index} className={styles.dayPanel} style={{ width: colWidth }}>
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
          hourHeight={MULTIDAY_HOUR_HEIGHT}
          hideTags
          tier="compact"
        />
      </div>
    );
  };

  return (
    <div className={styles.outerContainer}>
      <div
        className={styles.scrollArea}
        ref={scrollAreaRef}
        style={{
          ...(scrollLocked ? { overflow: "hidden" } : undefined),
          visibility: initialScrollDone ? "visible" : "hidden",
        }}
      >
        <div className={styles.stripWrapper} onPointerDown={handlePointerDown}>
          <motion.div
            className={styles.strip}
            drag="x"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ left: -2 * panelWidth, right: 0 }}
            dragElastic={0.15}
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
            {columnDates.map((date, index) => renderDayPanel(date, index))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default MultiDayLandscapeView;

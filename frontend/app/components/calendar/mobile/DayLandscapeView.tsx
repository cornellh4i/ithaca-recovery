import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls, useDragControls, type PanInfo } from "framer-motion";
import styles from "../../../../styles/components/calendar/mobile/DayLandscapeView.module.scss";
import DailyViewRow from "../desktop/DailyViewRow";
import { fetchMeetingsByDay, invalidateCache } from "../desktop/DayView";
import { formatETDateString, getCurrentETMinutesSinceMidnight } from "../../../../util/date/timeUtils";
import { formatMeetingDateLine } from "../../../../util/date/timeFormat";
import { passesTagFilters, passesRoomFilter, MeetingFilters } from "../../../../util/filters/meetingFilters";
import { defaultRooms } from "../../../../util/rooms/rooms";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../../util/meetings/meetingOverlapLayout";
import { addDaysToDate } from "../../../../util/date/weekDates";
import { useElementSize } from "../../../../hooks/useElementSize";
import { useCalendarContext } from "../../../context/CalendarProvider";
import TopLoadingBar from "../../atoms/TopLoadingBar";

type Meeting = OverlapMeeting;

type Room = {
  name: string;
  primaryColor: string;
  meetings: Meeting[];
};

// The full day, matching desktop DayView/WeekView -- now that the hour axis can scroll
// horizontally (see MIN_HOUR_WIDTH below), there's no width-driven reason to restrict this to
// business hours the way the original single-axis design needed to.
const START_HOUR = 0;
const END_HOUR = 24;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// Only 1 meeting ever shows per room/time slot -- at this row height there's no room for a
// second stacked lane, so any overlap folds straight into the "+N" pill (DailyViewRow already
// supports this via layoutOverlappingMeetings' maxVisibleOverlap param).
const MAX_VISIBLE_OVERLAP = 1;

// Fixed regardless of measured width -- letting the room column's own width vary too would
// add a second axis of layout shifting for no benefit. Matches MIN_HOUR_WIDTH below so the
// corner cell (room column x header row) reads as a natural square rather than a stray
// sliver, and is wide enough that room names (e.g. "Room for Improvement", "Children's Room
// @ 518 - Zoom") read as more than 2-3 letters before truncating.
const ROOM_COL_WIDTH = 120;
// An explicit constant (also set as the header row's real inline height below) rather than
// letting CSS padding decide it implicitly, so the room-row height math has an exact, matching
// number to subtract.
const HEADER_HEIGHT = 24;
// Row height always fits the room axis to the container exactly -- no floor, so the room axis
// never scrolls (only the hour axis, horizontally, does). Recomputed live off the measured
// scroll-area height (see useElementSize below). No MIN clamp: unlike a legibility floor that
// would force scroll once enough rooms are on screen, this view stays single-axis (horizontal
// only) unconditionally, even if that means rows get quite short with a lot of rooms filtered
// in on a short screen.
const MAX_ROW_HEIGHT = 44;
// Hour axis compresses to fit width first, but not below a legible size -- 24 hours at this
// floor (2880px) exceeds a landscape phone's actual width (~700-800px) by a wide margin, so
// this view scrolls horizontally in essentially every real case, same as desktop DayView's
// own 155px/hr does at 24 * 155 = 3720px.
// .roomLabel and .headerCorner are sticky-left (see the module.scss) so they stay put through
// that scroll, same mechanism desktop DayView already uses for its own sticky room column.
const MIN_HOUR_WIDTH = 120;
// A few hours of margin so scrollToCurrentTime (below) doesn't park "now" flush against the
// left edge, matching desktop DayView's own -300px offset in spirit.
const SCROLL_LEAD_HOURS = 2;
// Distance/velocity a vertical drag needs to clear before it counts as a real "swipe to the
// next/previous day" gesture, not just a wobble -- matches DayPortraitView's own thresholds
// (the closer precedent here: a single-day, external-selectedDate-driven carousel, unlike
// MultiDayLandscapeView's locally-paged one) so both carousels feel consistent.
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 400;
const SETTLE_TRANSITION = { type: "tween" as const, duration: 0.25, ease: "easeOut" as const };

const formatHour = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour}${period}`;
};

const isDateToday = (date: Date): boolean => formatETDateString(date) === formatETDateString(new Date());

// An explicit lookup, not a generic parser, since util/rooms.ts's list is small and fixed --
// "Room" appears in a different position in each name ("X Room", "Room for X", "X's Room @
// 518"), so a single string rule can't cover all of them without also risking a wrong-looking
// truncation for a name it wasn't actually written for. ROOM_COL_WIDTH (120px) is too narrow
// for most of these in full, so this trims to just the distinguishing word instead of letting
// CSS ellipsis cut them off mid-word.
const ROOM_DISPLAY_NAMES: Record<string, string> = {
  "Serenity Room": "Serenity",
  "Seeds of Hope Room": "Hope",
  "Unity Room": "Unity",
  "Room for Improvement": "Improvement",
  "Room for Acceptance": "Acceptance",
  "Room for Gratitude": "Gratitude",
  "Serenity Room - Zoom": "Serenity - Zoom",
  "Seeds of Hope Room - Zoom": "Hope - Zoom",
  "Unity Room - Zoom": "Unity - Zoom",
  "Room for Improvement - Zoom": "Improvement - Zoom",
  "Children's Room @ 518 - Zoom": "Children's - Zoom",
};
export const roomDisplayName = (name: string): string => ROOM_DISPLAY_NAMES[name] ?? name;

interface DayLandscapeViewProps {
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

// Landscape phone's default view (see mobile/MultiDayLandscapeView for the alternate):
// reuses desktop DayView's per-room grouping and DailyViewRow's row-stack rendering wholesale
// -- rooms as horizontal rows, at BoxText's subcompact tier. The room axis (vertical) fits to
// the container in the common case (see rowHeight); the hour axis (horizontal) scrolls, same
// as desktop DayView's own does, since 24 hours at a legible width doesn't fit a landscape
// phone's actual width.
//
// Day-to-day navigation is a vertical drag -- a 3-panel infinite carousel (prev/current/next,
// same trick DayPortraitView's own horizontal one uses) stacked top to bottom, dragged via
// framer-motion. Dragging down reveals the panel above (the previous day); dragging up reveals
// the panel below (the next day) -- the whole panel (header, date line, room rows) moves as
// one unit, not just the meeting content, since day navigation and the (now purely horizontal)
// hour-axis scroll are different gestures on the same surface.
const DayLandscapeView: React.FC<DayLandscapeViewProps> = ({
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
  const { changeSelectedDate, transitionDirection, transitionAlreadyAnimatedByCaller, setNavHidden } =
    useCalendarContext();
  // No scroll-to-hide-navbar here (unlike DayPortraitView/MultiDayLandscapeView) -- the
  // vertical gesture is now day-navigation, not a scroll a nav-hide listener could also read.
  // Forces the navbar visible once on mount/switch-in, in case it was left hidden by whichever
  // view was active before this one.
  useEffect(() => {
    setNavHidden(false);
  }, [setNavHidden]);

  const [prevMeetings, setPrevMeetings] = useState<Room[]>([]);
  const [currentMeetings, setCurrentMeetings] = useState<Room[]>([]);
  const [nextMeetings, setNextMeetings] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTimePosition, setCurrentTimePosition] = useState<number | null>(null);
  const [scrollAreaRef, scrollAreaSize] = useElementSize<HTMLDivElement>();
  // ResizeObserver's initial callback can lag the first paint by a frame -- clamp to sensible
  // minimums so the very first render doesn't briefly divide by a near-zero size.
  const hourWidth = Math.max((scrollAreaSize.width - ROOM_COL_WIDTH) / HOURS.length, MIN_HOUR_WIDTH);
  // The grid's real total width -- .headerRow/.roomRow/.roomContent all need this set
  // explicitly (not just flex-grow) or they stay capped at the viewport's width no matter how
  // large hourWidth's floor pushes the content, and .scrollArea never actually gets anything
  // to scroll (position: absolute meeting cards overflowing their box doesn't count -- it
  // doesn't affect that box's own size, only real box width does).
  const gridContentWidth = hourWidth * HOURS.length;
  const totalGridWidth = ROOM_COL_WIDTH + gridContentWidth;

  const prevDate = addDaysToDate(selectedDate, -1);
  const nextDate = addDaysToDate(selectedDate, 1);

  const selectedDateRef = useRef(selectedDate);
  const fetchRequestIdRef = useRef(0);

  // Fetches all 3 of the carousel's panels -- prev/current/next day -- in parallel. Each hits
  // desktop DayView's own per-day dayMeetingCache independently, so paging one day at a time
  // (the only granularity this view has) only ever needs 1 fresh fetch per page (the newly-
  // revealed day); the other 2 panels' data is already cached from the page before.
  const fetchData = useCallback(async (forceFetch = false) => {
    const current = selectedDateRef.current;
    const prev = addDaysToDate(current, -1);
    const next = addDaysToDate(current, 1);
    if (forceFetch) {
      invalidateCache(prev);
      invalidateCache(current);
      invalidateCache(next);
    }
    const requestId = ++fetchRequestIdRef.current;
    setIsLoading(true);
    try {
      const [prevData, currentData, nextData] = await Promise.all([
        fetchMeetingsByDay(prev),
        fetchMeetingsByDay(current),
        fetchMeetingsByDay(next),
      ]);
      if (requestId === fetchRequestIdRef.current) {
        setPrevMeetings(prevData);
        setCurrentMeetings(currentData);
        setNextMeetings(nextData);
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useLayoutEffect(() => {
    selectedDateRef.current = selectedDate;
    fetchData();
  }, [selectedDate, fetchData]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData(true);
    }
  }, [refreshTrigger, fetchData]);

  // Gates .scrollArea's visibility until the horizontal scroll-to-current-time below actually
  // runs -- same flash desktop DayView's own scrollToCurrentTime has always had (a beat of
  // the wrong scroll position at hour 0 before JS jumps it to "now"), plus a wait for
  // scrollAreaSize.width's first real ResizeObserver measurement (desktop's own hourWidth is a
  // hardcoded constant, always "ready"; this view's isn't). Fires exactly once, on this view's
  // first successful measurement -- not on every later date change (day-navigation swipe,
  // "Today", mini-calendar pick), matching WeekView/DayPortraitView's own one-way
  // initialScrollDone gate, rather than re-centering on "now" every time the day changes.
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const hasScrolledRef = useRef(false);
  useLayoutEffect(() => {
    if (hasScrolledRef.current) return;
    if (scrollAreaSize.width === 0) {
      // No measurement yet -- still reveal the grid so a missing ResizeObserver or a
      // never-resized hidden ancestor can't leave .scrollArea permanently invisible. Doesn't
      // set hasScrolledRef, so the effect retries once a real width arrives.
      setInitialScrollDone(true);
      return;
    }

    const el = scrollAreaRef.current;
    if (el) {
      const currentHour = Math.floor(getCurrentETMinutesSinceMidnight() / 60);
      const scrollOffset = (currentHour - START_HOUR - SCROLL_LEAD_HOURS) * hourWidth;
      el.scrollLeft = Math.max(0, scrollOffset);
    }
    hasScrolledRef.current = true;
    setInitialScrollDone(true);
  }, [scrollAreaSize.width, hourWidth, scrollAreaRef]);

  // No bounds check needed here -- START_HOUR/END_HOUR span the full 0-24 day, so "now" is
  // always in range (unlike a business-hours-restricted range, where this would need to hide
  // the line outside START_HOUR-END_HOUR).
  const updateTimePosition = useCallback(() => {
    const minutesSinceMidnight = getCurrentETMinutesSinceMidnight();
    setCurrentTimePosition((minutesSinceMidnight - START_HOUR * 60) * (hourWidth / 60));
  }, [hourWidth]);

  useEffect(() => {
    updateTimePosition();
    const intervalId = setInterval(updateTimePosition, 60000);
    return () => clearInterval(intervalId);
  }, [updateTimePosition]);

  // Every panel shares the same room list/count (defaultRooms filtered by room, independent of
  // any day's actual meetings) and so the same rowHeight -- only the meetings inside each row
  // differ per panel. Memoized per fetched Room[] since re-filtering/re-laying-out 12 rooms on
  // every unrelated re-render (a scroll, an hourWidth recompute) would be wasted work.
  const computeCombinedRooms = useCallback(
    (meetings: Room[]) =>
      defaultRooms
        .filter((defaultRoom) => passesRoomFilter(defaultRoom.name, filters))
        .map((defaultRoom) => {
          const roomWithMeetings = meetings.find((m) => m.name === defaultRoom.name);
          const roomMeetings = roomWithMeetings?.meetings.filter((m) => passesTagFilters(m.tags, filters)) ?? [];
          return {
            name: defaultRoom.name,
            primaryColor: defaultRoom.primaryColor,
            meetings: layoutOverlappingMeetings(roomMeetings, MAX_VISIBLE_OVERLAP),
          };
        }),
    [filters]
  );
  const prevRooms = useMemo(() => computeCombinedRooms(prevMeetings), [computeCombinedRooms, prevMeetings]);
  const currentRooms = useMemo(() => computeCombinedRooms(currentMeetings), [computeCombinedRooms, currentMeetings]);
  const nextRooms = useMemo(() => computeCombinedRooms(nextMeetings), [computeCombinedRooms, nextMeetings]);
  const filteredRoomCount = useMemo(
    () => defaultRooms.filter((defaultRoom) => passesRoomFilter(defaultRoom.name, filters)).length,
    [filters]
  );

  // Fits the room axis to the container's actual available height exactly -- no floor (see
  // MAX_ROW_HEIGHT's own comment), so the room axis never needs to scroll. Divides by the
  // *filtered* room count, so filtering down to fewer rooms grows their rows to fill the
  // freed-up space instead of leaving it blank. panelHeight (the full viewport height, header
  // included) is what the vertical drag carousel below is measured in.
  const availableRowsHeight = Math.max(scrollAreaSize.height - HEADER_HEIGHT, 0);
  const rowHeight = Math.min(availableRowsHeight / Math.max(filteredRoomCount, 1), MAX_ROW_HEIGHT);
  const panelHeight = scrollAreaSize.height;

  // Classic 3-panel infinite-carousel positioning (vertical, not DayPortraitView's horizontal):
  // strip is 3*panelHeight tall, prev panel at y:0, current (resting) panel at y:-panelHeight,
  // next panel at y:-2*panelHeight. Recentered (no animation, just a position reset) whenever
  // panelHeight or the selected date changes -- covers both a resize and any non-drag date
  // change (mini-calendar pick, "Today"), for which the freshly-computed prev/current/next
  // panels should appear immediately rather than mid-slide.
  const controls = useAnimationControls();
  useLayoutEffect(() => {
    controls.set({ y: -panelHeight });
  }, [panelHeight, selectedDate, controls]);

  // .verticalStrip's own drag="y" only recognizes a gesture that starts on itself. Starting the
  // drag manually from a pointerdown anywhere in .scrollArea (dragListener={false} below stops
  // .verticalStrip from also auto-starting one from its own pointerdown) reliably captures a
  // swipe starting anywhere in the row, regardless of which descendant (a room label, a meeting
  // card, empty grid space) it began on -- same reasoning as DayPortraitView's own
  // handleRowPointerDown.
  // A settle animation plus the date commit takes ~250ms. Ignore a new drag gesture until that
  // completes -- otherwise two overlapping handlers race on selectedDateRef and on the strip's
  // own `y`, and a fast double-swipe can advance the calendar by only one day or leave the
  // strip on the wrong panel.
  const isCommittingRef = useRef(false);
  const dragControls = useDragControls();
  const handleAreaPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isCommittingRef.current) return;
    dragControls.start(event);
  };

  // A completed drag still fires a native click on whatever element the pointer started on --
  // here, a meeting card, which would open its popup on top of the day change. Same guard
  // DayPortraitView/WeekStrip use.
  const isDraggingRef = useRef(false);
  const handleStripDragStart = () => {
    isDraggingRef.current = true;
  };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleStripDragEnd = async (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const pastThreshold =
      Math.abs(info.offset.y) > SWIPE_OFFSET_THRESHOLD || Math.abs(info.velocity.y) > SWIPE_VELOCITY_THRESHOLD;

    if (!pastThreshold) {
      isDraggingRef.current = false;
      controls.start({ y: -panelHeight }, SETTLE_TRANSITION);
      return;
    }

    // Drag up (negative offset) reveals the panel below = the next day; drag down reveals the
    // panel above = the previous day.
    const forward = info.offset.y < 0;
    isCommittingRef.current = true;
    // Parks the strip fully on the neighbor's panel first -- since that panel's content *is*
    // what the newly recomputed "current" panel becomes once changeSelectedDate commits, the
    // recenter below is visually seamless (the standard infinite-carousel swap-while-at-the-
    // edge trick).
    await controls.start({ y: forward ? -2 * panelHeight : 0 }, SETTLE_TRANSITION);
    if (!mountedRef.current) return;
    changeSelectedDate(addDaysToDate(selectedDateRef.current, forward ? 1 : -1), { alreadyAnimatedByCaller: true });
    controls.set({ y: -panelHeight });
    isDraggingRef.current = false;
    isCommittingRef.current = false;
  };

  // Shared by all 3 panels below. The inner motion.div plays a directional fade (same
  // direction/duration convention as DayPortraitView's own CalendarHeader/DayColumn slide) so
  // the room content visibly moves for external date changes (mini-calendar pick, "Today")
  // too, not just this view's own drag. initial={false} suppresses it specifically for drag-
  // committed changes (transitionAlreadyAnimatedByCaller), where the drag's own pan already was
  // that motion.
  const renderDayPanel = (date: Date, rooms: ReturnType<typeof computeCombinedRooms>) => {
    const dateKey = formatETDateString(date);
    const panelIsToday = isDateToday(date);
    return (
      <div key={dateKey} className={styles.dayPanel} style={{ height: panelHeight, width: totalGridWidth }}>
        <div className={styles.headerRow} style={{ height: HEADER_HEIGHT, width: totalGridWidth }}>
          <div className={styles.headerCorner} style={{ width: ROOM_COL_WIDTH }}>
            <span className={styles.headerCornerLabel}>{formatMeetingDateLine(date, true, true)}</span>
          </div>
          {HOURS.map((hour) => (
            <div key={hour} className={styles.hourLabel} style={{ width: hourWidth }}>
              {formatHour(hour)}
            </div>
          ))}
        </div>

        <div className={styles.rowsContainer} style={{ width: totalGridWidth }}>
          {panelIsToday && currentTimePosition !== null && (
            <div
              className={styles.currentTimeLine}
              style={{ left: ROOM_COL_WIDTH + currentTimePosition }}
            />
          )}
          {rooms.map((room) => (
            <div key={room.name} className={styles.roomRow} style={{ height: rowHeight, width: totalGridWidth }}>
              <div className={styles.roomLabel} style={{ width: ROOM_COL_WIDTH }}>
                <span className={styles.roomDot} style={{ backgroundColor: room.primaryColor }} />
                <span className={styles.roomLabelText}>{roomDisplayName(room.name)}</span>
              </div>
              <div className={styles.roomContent} style={{ width: gridContentWidth }}>
                <div className={styles.hourGrid} aria-hidden="true">
                  {HOURS.map((hour) => (
                    <div key={hour} className={styles.hourGridCell} style={{ width: hourWidth }} />
                  ))}
                </div>
                <motion.div
                  key={dateKey}
                  initial={
                    transitionAlreadyAnimatedByCaller
                      ? false
                      : { y: transitionDirection === "forward" ? 12 : -12, opacity: 0 }
                  }
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  style={{ height: "100%" }}
                >
                  <DailyViewRow
                    roomColor={room.primaryColor}
                    meetings={room.meetings}
                    selectedMeetingID={selectedMeetingID}
                    setSelectedMeetingID={setSelectedMeetingID}
                    selectedOccurrenceDate={selectedOccurrenceDate}
                    setSelectedNewMeeting={setSelectedNewMeeting}
                    setAnchorEl={setAnchorEl}
                    columnDate={date}
                    setLastClickedDate={setLastClickedDate}
                    conflictMids={conflictMids}
                    syncErrorMids={syncErrorMids}
                    hourWidth={hourWidth}
                    rowHeight={rowHeight}
                    startHour={START_HOUR}
                    tier="subcompact"
                    uniformHeight
                  />
                </motion.div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.outerContainer}>
      <TopLoadingBar active={isLoading} />
      <div
        className={styles.scrollArea}
        ref={scrollAreaRef}
        onPointerDown={handleAreaPointerDown}
        style={{
          ...(scrollLocked ? { overflow: "hidden" } : undefined),
          visibility: initialScrollDone ? "visible" : "hidden",
          touchAction: "pan-x",
        }}
      >
        <motion.div
          className={styles.verticalStrip}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: -2 * panelHeight, bottom: 0 }}
          dragElastic={0.2}
          // handleStripDragEnd already owns the post-release animation (it computes and
          // commits its own settle via controls.start()) -- framer-motion's default built-in
          // momentum/inertia decay would otherwise start animating the same y value at the
          // same time, the two fighting each other and reading as heavy, resistant drag (the
          // exact bug found and fixed in MultiDayLandscapeView's own horizontal drag).
          dragMomentum={false}
          animate={controls}
          onDragStart={handleStripDragStart}
          onDragEnd={handleStripDragEnd}
          onClickCapture={(e) => {
            if (isDraggingRef.current) {
              e.stopPropagation();
              isDraggingRef.current = false;
            }
          }}
          style={{ touchAction: "pan-x", height: panelHeight * 3, width: totalGridWidth }}
        >
          {renderDayPanel(prevDate, prevRooms)}
          {renderDayPanel(selectedDate, currentRooms)}
          {renderDayPanel(nextDate, nextRooms)}
        </motion.div>
      </div>
    </div>
  );
};

export default DayLandscapeView;

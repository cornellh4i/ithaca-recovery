import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useDragControls, type PanInfo } from "framer-motion";
import WeekStrip from "./WeekStrip";
import CalendarHeader from "./CalendarHeader";
import DayColumn from "./DayColumn";
import { filterMeetingsForDate, MeetingFilters } from "../../../util/meetingFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, REMOTE_COLOR } from "../../../util/filterColors";
import { formatETDateString } from "../../../util/timeUtils";
import { layoutOverlappingMeetings, OverlapMeeting } from "../../../util/meetingOverlapLayout";
import { getFirstDayOfWeek, addDaysToDate } from "../../../util/weekDates";
import { useWeekMeetings } from "../../../hooks/useWeekMeetings";
import { useCalendarContext } from "../../context/CalendarProvider";
import styles from "../../../styles/components/calendar/MobileCalendarView.module.scss";

interface Meeting extends OverlapMeeting {
  syncError?: boolean;
}

// Mobile shows up to 3 overlapping meetings side by side before folding into a "+N"
// indicator, vs. desktop WeeklyView's default of 2 (see util/meetingOverlapLayout.ts).
const MOBILE_MAX_VISIBLE_OVERLAP = 3;

// Half of DayColumn's 120px/hour desktop default -- deliberately trades detail for fitting
// more of the day on screen at once (see .timeColumn/.timeSlot/.dayColumnWrapper below,
// which must stay in sync with this), and DayColumn's tag row is dropped entirely to make
// the shorter rows workable (see BoxText's hideTags).
const MOBILE_HOUR_HEIGHT = 60;

const formatTime = (hour: number): string => {
  const period = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour} ${period}`;
};

const timeSlots = Array.from({ length: 24 }, (_, i) => formatTime(i));

// A small downward/upward scroll delta before toggling nav visibility, so tiny scroll
// jitter (e.g. rubber-banding at the top) doesn't flicker the navbar in and out.
const SCROLL_HIDE_THRESHOLD_PX = 4;

// Distance/velocity a horizontal drag on the day column needs to clear before it counts as a
// real "swipe to the next/previous day" gesture -- matches WeekStrip's own thresholds so both
// gesture surfaces feel consistent.
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 400;

// Caps how far dayColumnWrapper visually follows the drag before release snaps it back.
// Without this, dragging rightward (swiping backward to the previous day) had nothing
// stopping the wrapper from sliding arbitrarily far away from .timeColumn's fixed left
// edge, opening an ever-growing gap between the two -- WeekStrip's own drag wrapper has no
// such neighboring sibling to detach from, so it never needed a constraint. Larger than
// SWIPE_OFFSET_THRESHOLD so the preview isn't clamped before a real swipe even registers.
const DRAG_PREVIEW_MAX_PX = 100;

interface MobileCalendarViewProps {
  filters: MeetingFilters;
  selectedDate: Date;
  selectedMeetingID: string | null;
  setSelectedMeetingID: (meetingId: string) => void;
  setSelectedNewMeeting: (newMeetingExists: boolean) => void;
  setAnchorEl: (el: HTMLElement) => void;
  refreshTrigger?: number;
  scrollLocked?: boolean;
  conflictMids?: Set<string>;
  isAdmin: boolean | null;
}

// Mobile portrait day view: WeekStrip + CalendarHeader stay in place (plain flex siblings
// above the scroll area, not competing for the same scroll container DayColumn uses) while
// DayColumn's own wrapper scrolls independently underneath -- also where the mobile navbar's
// scroll-hide listener attaches (writes navHidden to CalendarProvider, read by
// MobileAppNavbar). CalendarHeader's heading and DayColumn share the same
// transitionDirection/selectedDate-keyed swap (CalendarProvider's changeSelectedDate), so a
// swipe/tap/mini-calendar-pick animates both together regardless of which one triggered it.
const MobileCalendarView: React.FC<MobileCalendarViewProps> = ({
  filters,
  selectedDate,
  selectedMeetingID,
  setSelectedMeetingID,
  setSelectedNewMeeting,
  setAnchorEl,
  refreshTrigger = 0,
  scrollLocked = false,
  conflictMids,
  isAdmin,
}) => {
  const { setNavHidden, changeSelectedDate, transitionDirection, transitionCrossesWeek } = useCalendarContext();
  const weekStartDate = getFirstDayOfWeek(selectedDate);
  const allMeetings = useWeekMeetings(weekStartDate, refreshTrigger);

  const getRoomColor = (meeting: Meeting) => {
    if (meeting.tags.includes("Remote")) return REMOTE_COLOR;
    return ROOM_COLORS[meeting.room] ?? ZOOM_ROOM_COLOR;
  };

  const dayMeetings = useMemo(() => {
    const filtered = filterMeetingsForDate(allMeetings, selectedDate, filters);
    return layoutOverlappingMeetings(filtered, MOBILE_MAX_VISIBLE_OVERLAP).map((meeting) => ({
      ...meeting,
      primaryColor: getRoomColor(meeting),
      overflowMeetings: meeting.overflowMeetings?.map((m) => ({ ...m, primaryColor: getRoomColor(m) })),
    }));
  }, [allMeetings, filters, selectedDate]);

  const selectedEtDateStr = formatETDateString(selectedDate);
  const isToday = selectedEtDateStr === formatETDateString(new Date());

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  // Gates .scrollArea's visibility until the very first scroll-to-current-time completes --
  // same flash DailyView/WeeklyView's own scrollToCurrentTime has always had (a beat of the
  // wrong scroll position at 12 AM before JS jumps it to "now"), which useLayoutEffect alone
  // doesn't fully rule out (e.g. a slow first paint). One-way: only ever flips true once, on
  // the very first date this view renders -- later date changes don't re-hide already-
  // visible content.
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
    lastScrollTopRef.current = scrollPosition;
  }, []);

  useLayoutEffect(() => {
    scrollToCurrentTime();
    setInitialScrollDone(true);
  }, [selectedEtDateStr, scrollToCurrentTime]);

  const handleScroll = () => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const delta = el.scrollTop - lastScrollTopRef.current;
    if (delta > SCROLL_HIDE_THRESHOLD_PX) {
      setNavHidden(true);
    } else if (delta < -SCROLL_HIDE_THRESHOLD_PX) {
      setNavHidden(false);
    }
    lastScrollTopRef.current = el.scrollTop;
  };

  const handleDaySwipeEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const pastThreshold =
      Math.abs(info.offset.x) > SWIPE_OFFSET_THRESHOLD || Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    if (!pastThreshold) return;

    // Swipe left (negative offset) = forward = later; swipe right = backward = earlier.
    changeSelectedDate(addDaysToDate(selectedDate, info.offset.x < 0 ? 1 : -1));
  };

  // dayColumnWrapper's own drag="x" only recognizes a gesture that starts on itself -- but it
  // sits to the right of .timeColumn (the ~50px time-label strip), which has no drag handler
  // at all. A swipe starting there (common when swiping left-to-right, since that gesture
  // naturally starts further left) was silently dropped instead of registering. Starting the
  // drag manually from a pointerdown anywhere in the row (dragListener={false} below stops
  // dayColumnWrapper from also auto-starting one from its own pointerdown) widens the
  // recognized area to the full row while .timeColumn itself still never visually moves --
  // only dayColumnWrapper does.
  const dragControls = useDragControls();
  const handleRowPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragControls.start(event);
  };

  return (
    <div className={styles.container}>
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
        <div className={styles.timeColumn}>
          {timeSlots.map((time, index) => (
            <div key={index} className={styles.timeSlot}>
              {time}
            </div>
          ))}
        </div>

        {/* Only this wrapper visually transforms on drag (not .timeColumn, not the whole
            scrollArea) -- the gesture itself is started from .scrollArea's onPointerDown
            above (see handleRowPointerDown) so it can begin over .timeColumn too, but
            dragListener={false} here means it never starts a second, independent one from its
            own pointerdown. touchAction: pan-y (both here and on .scrollArea) keeps vertical
            touch-scroll on the time labels / day column working normally alongside it.
            dragSnapToOrigin returns this wrapper to x:0 immediately on release regardless of
            outcome; the actual slide is the inner date-keyed swap below. No AnimatePresence --
            a plain key change unmounts the old day and mounts the new one in the same commit
            (no dual-mount exit period to manage), and the new one plays its own enter
            transition. See CalendarHeader.tsx's matching comment for why. */}
        <motion.div
          className={styles.dayColumnWrapper}
          drag="x"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ left: -DRAG_PREVIEW_MAX_PX, right: DRAG_PREVIEW_MAX_PX }}
          dragElastic={0.3}
          dragSnapToOrigin
          onDragEnd={handleDaySwipeEnd}
          style={{ touchAction: "pan-y" }}
        >
          <motion.div
            key={selectedEtDateStr}
            className={styles.dayColumnAnimatedInner}
            initial={{ x: transitionCrossesWeek ? 0 : transitionDirection === "forward" ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
          >
            <DayColumn
              roomColor={ZOOM_ROOM_COLOR} // Unused fallback: every meeting sets primaryColor via getRoomColor
              meetings={dayMeetings}
              selectedMeetingID={selectedMeetingID}
              setSelectedMeetingID={setSelectedMeetingID}
              setSelectedNewMeeting={setSelectedNewMeeting}
              setAnchorEl={setAnchorEl}
              conflictMids={conflictMids}
              hourHeight={MOBILE_HOUR_HEIGHT}
              hideTags
            />
            {isToday && (
              <div
                className={styles.currentTimeIndicator}
                style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) * (MOBILE_HOUR_HEIGHT / 60)}px` }}
              />
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default MobileCalendarView;

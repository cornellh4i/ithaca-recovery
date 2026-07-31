"use client";

import React, { useRef } from "react";
import { motion, type PanInfo } from "framer-motion";
import { getFirstDayOfWeek, getDaysOfWeek, addDaysToDate } from "../../../util/weekDates";
import { formatETDateString } from "../../../util/timeUtils";
import { useCalendarContext } from "../../context/CalendarProvider";
import styles from "../../../styles/components/calendar/WeekStrip.module.scss";

// 1-letter weekday abbreviation, ET-explicit like the rest of this calendar's date handling
// (a local-timezone toLocaleDateString call could disagree with the real ET calendar day near
// midnight ET on a UTC-default runtime, same class of bug the ET-safe helpers elsewhere guard
// against).
const weekdayLetterFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});
const formatWeekdayLetter = (date: Date): string => weekdayLetterFormatter.format(date).charAt(0);

const formatDayNumber = (date: Date): string => formatETDateString(date).split("-")[2].replace(/^0/, "");

// Distance/velocity a horizontal drag on the strip needs to clear before it counts as a real
// "swipe the whole week" gesture rather than an incidental touch-drag.
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 400;

const WeekStrip: React.FC = () => {
  const { selectedDate, changeSelectedDate, transitionDirection, transitionCrossesWeek } = useCalendarContext();
  const weekStartDate = getFirstDayOfWeek(selectedDate);
  const weekStartEtDateStr = formatETDateString(weekStartDate);
  const days = getDaysOfWeek(weekStartDate);
  const todayEtDateStr = formatETDateString(new Date());
  const selectedEtDateStr = formatETDateString(selectedDate);

  // A completed drag still fires a native click on whatever day button happened to be under
  // the pointer's starting position -- and that click can reach the button's onClick *before*
  // framer-motion's own (slightly deferred) onDragEnd callback runs, so setting this flag in
  // onDragEnd is too late to catch it. Set at onDragStart instead (drag recognition starts the
  // moment the pointer moves past a small threshold, well before any click could fire), and
  // cleared by the click-capture handler below once it's actually suppressed one.
  const isDraggingRef = useRef(false);

  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const pastThreshold =
      Math.abs(info.offset.x) > SWIPE_OFFSET_THRESHOLD || Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    if (pastThreshold) {
      // Swipe left (negative offset) = forward = later; swipe right = backward = earlier.
      const direction = info.offset.x < 0 ? 7 : -7;
      changeSelectedDate(addDaysToDate(selectedDate, direction));
    }
  };

  const stripContent = (
    <div
      className={styles.strip}
      onClickCapture={(e) => {
        if (isDraggingRef.current) {
          e.stopPropagation();
          isDraggingRef.current = false;
        }
      }}
    >
      {days.map((day) => {
        const dayEtDateStr = formatETDateString(day);
        const isToday = dayEtDateStr === todayEtDateStr;
        const isSelected = dayEtDateStr === selectedEtDateStr;

        const circleClass = [
          styles.circle,
          isSelected && isToday && styles.selectedToday,
          isSelected && !isToday && styles.selectedNotToday,
          !isSelected && isToday && styles.today,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={dayEtDateStr}
            type="button"
            className={styles.dayButton}
            aria-pressed={isSelected}
            onClick={() => changeSelectedDate(day)}
          >
            <span className={styles.weekday}>{formatWeekdayLetter(day)}</span>
            {/* layoutId lets framer-motion FLIP-animate the highlight moving between
                buttons within the same week (same-week tap/swipe); on a week-boundary
                change the whole strip below swaps instead, so there's no shared element
                to animate between the old and new week's buttons. */}
            {isSelected ? (
              <motion.span layoutId="week-strip-highlight" className={circleClass}>
                {formatDayNumber(day)}
              </motion.span>
            ) : (
              <span className={circleClass}>{formatDayNumber(day)}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={styles.stripViewport}>
      {/* drag lives on this stable outer wrapper (never remounts -- no key prop), separate
          from the date-keyed inner swap below. dragSnapToOrigin returns this wrapper to x:0
          immediately on release; the actual week-boundary slide is the inner swap. No
          AnimatePresence -- a plain key change (only on a week-boundary crossing; same-week
          changes keep the same key and just re-render in place, which is what lets the
          layoutId highlight below animate smoothly between buttons) unmounts the old week and
          mounts the new one in the same commit, which plays its own enter transition. See
          CalendarHeader.tsx's matching comment for why this is preferred over AnimatePresence
          here. */}
      <motion.div
        drag="x"
        dragSnapToOrigin
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{ touchAction: "pan-y" }}
      >
        <motion.div
          key={weekStartEtDateStr}
          initial={transitionCrossesWeek ? { x: transitionDirection === "forward" ? "100%" : "-100%" } : false}
          animate={{ x: 0 }}
          transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        >
          {stripContent}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default WeekStrip;

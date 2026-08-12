import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from "../../../../styles/components/calendar/desktop/CalendarNavbar.module.scss";
import { formatMeetingDateLine, monthNameForETDateString, formatMeetingWeekLine } from "../../../../util/date/timeFormat";
import { formatETDateString } from "../../../../util/date/timeUtils";
import { dateEnterMotion, type SwipeDirection } from "../../../../util/date/dateTransition";

// Day's heading slide matches its own content's magnitude (DayView/DayLandscapeView's y:12);
// Week's/mobile-portrait's slide matches DayPortraitView's own heading precedent (x:40, wider
// than its content's x:24 -- the heading was tuned separately before this shared helper existed).
const HEADING_MAGNITUDE: Record<'x' | 'y', number> = { x: 40, y: 12 };

type CalendarHeaderProps = {
  selectedDate: Date;
  selectedView: string;
  // null means "not yet known" (the caller's own auth check is still pending, or -- for
  // signage -- there's no auth check at all): the View-only pill below only appears once
  // isAdmin has actually resolved to false, not just whenever it's falsy, so it doesn't
  // flash on into view for a beat before the real (often "is an admin") result comes in.
  isAdmin: boolean | null;
  // The interactive Day/Week/Today/arrow controls -- CalendarNavbar owns their state and
  // handlers, but they must render as a flex sibling of the <h2> inside .navbarContainer for
  // the container-query-driven scaling below to work, so CalendarHeader takes them as children
  // instead of rendering just the <h2> in isolation. Optional: the mobile day view renders
  // CalendarHeader directly (bypassing CalendarNavbar entirely -- WeekStrip/the mobile navbar's
  // Today button/bottom sheets replace that role there), so it has no controls to pass.
  children?: React.ReactNode;
  // When set, the date-range heading slides between values (keyed by transitionKey, e.g. the
  // ET date string) instead of updating in place -- driven by the same selectedDate change
  // that also swaps the content below it (DayPortraitView's DayColumn on mobile, DayView's
  // room rows / WeekView's day columns on desktop), so the two appear to move simultaneously.
  // The "View only" pill below is deliberately never part of this animation (stays fixed while
  // the heading swaps), matching the mobile swipe spec.
  // axis: which direction the slide travels -- 'x' (default) matches DayPortraitView's and
  // WeekView's horizontal one; 'y' matches DayView's/DayLandscapeView's vertical one.
  // CalendarNavbar (desktop) requests whichever axis matches its own active view's content.
  animatedHeading?: { transitionKey: string; direction: SwipeDirection; axis?: 'x' | 'y' };
};

const CalendarHeader: React.FC<CalendarHeaderProps> = ({ selectedDate, selectedView, isAdmin, children, animatedHeading }) => {
  const reducedMotion = useReducedMotion();
  const getDateRange = (date: Date): React.ReactNode => {
    if (selectedView === 'Day') {
      return formatMeetingDateLine(date, true);
    }

    if (selectedView === 'Week') {
      return formatMeetingWeekLine(date);
    }

    // Month
    const etDateStr = formatETDateString(date);
    const [year] = etDateStr.split('-');
    return `${monthNameForETDateString(etDateStr)} ${year}`;
  };

  // No AnimatePresence -- a plain key change here unmounts the old <h2> and mounts a new one
  // in the same commit (no dual-mount exit period to manage), and the freshly-mounted one
  // plays its own initial->animate enter transition. Trades away an animated *exit* for the
  // old value (it just disappears) in exchange for not depending on AnimatePresence's
  // unmount-after-exit-completes machinery, which proved unreliable for this repeatedly-
  // changing-key use case.
  const heading = animatedHeading ? (
    <motion.h2
      key={animatedHeading.transitionKey}
      className={styles.navbarHeading}
      {...dateEnterMotion(
        animatedHeading.direction,
        animatedHeading.axis ?? 'x',
        HEADING_MAGNITUDE[animatedHeading.axis ?? 'x'],
        { reducedMotion },
      )}
    >
      {getDateRange(selectedDate)}
    </motion.h2>
  ) : (
    <h2 className={styles.navbarHeading}>{getDateRange(selectedDate)}</h2>
  );

  return (
    <div className={styles.headerWrapper}>
      <div className={styles.navbarContainer}>
        {heading}
        {children}
      </div>
      {isAdmin === false && (
        <div className={styles.viewOnlyPill}>
          <img src="/svg/lock-icon.svg" alt="" className={styles.viewOnlyIcon} />
          <span>View only - sign in as Admin to manage meetings</span>
        </div>
      )}
    </div>
  );
};

export default CalendarHeader;

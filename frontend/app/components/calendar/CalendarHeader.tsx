import React from 'react';
import styles from "../../../styles/components/calendar/CalendarNavbar.module.scss";
import { formatMeetingDateLine, monthNameForETDateString, formatMeetingWeekLine } from "../../../util/timeFormat";
import { formatETDateString } from "../../../util/timeUtils";

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
  // instead of rendering just the <h2> in isolation.
  children: React.ReactNode;
};

const CalendarHeader: React.FC<CalendarHeaderProps> = ({ selectedDate, selectedView, isAdmin, children }) => {
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

  return (
    <>
      <div className={styles.navbarContainer}>
        <h2 className={styles.navbarHeading}>{getDateRange(selectedDate)}</h2>
        {children}
      </div>
      {isAdmin === false && (
        <div className={styles.viewOnlyPill}>
          <img src="/svg/lock-icon.svg" alt="" className={styles.viewOnlyIcon} />
          <span>View only - sign in as Admin to manage meetings</span>
        </div>
      )}
    </>
  );
};

export default CalendarHeader;

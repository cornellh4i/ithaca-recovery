import React, { useState } from 'react';
import Dropdown from '../../atoms/Dropdown';
import CalendarHeader from '../shared/CalendarHeader';
import styles from "../../../../styles/components/calendar/desktop/CalendarNavbar.module.scss";
import {
  formatETDateString,
  convertETToUTC,
  addDaysToETDateString,
  addMonthsToETDateString,
} from "../../../../util/date/timeUtils";
import { getFirstDayOfWeek } from "../../../../util/date/weekDates";
import type { SwipeDirection } from "../../../../util/date/dateTransition";

// view_timeline / calendar_view_week (Material Symbols) -- same icons and same renderElement
// pattern MobileAppNavbar's own Day/Multi-Day dropdown uses (icon-only in the closed button
// via .viewOptionText's display:none, icon+label in the open list).
const VIEW_ICONS: Record<string, string> = {
  Day: "/svg/view-timeline-icon.svg",
  Week: "/svg/calendar-view-week-icon.svg",
};

// Week view's displayed range only changes when the week itself changes (see
// formatMeetingWeekLine), so the key is the week's start date, not selectedDate directly --
// otherwise picking a different day within the same visible week would re-trigger the heading
// transition for text that didn't actually change. Prefixed with the view name -- handleViewChange
// always resets selectedDate to today, so on a Day<->Week toggle when today is a Sunday
// (getFirstDayOfWeek(today) === today), the two branches would otherwise compute the identical ET
// date string and the heading would silently skip its transition even though the displayed text
// (day line vs. week line) really did change. Exported (not inlined in the component) so the
// Sunday case above has a direct unit test rather than depending on a real Sunday date -- Jest's
// "fake system time" is on the same real clock this function reads via getFirstDayOfWeek, so it
// still needs a fixed `date` argument, not `new Date()`, to be deterministic on any day.
export const computeHeadingTransitionKey = (selectedView: string, selectedDate: Date): string =>
  selectedView === 'Week'
    ? `Week:${formatETDateString(getFirstDayOfWeek(selectedDate))}`
    : `${selectedView}:${formatETDateString(selectedDate)}`;

type CalendarNavbarProps = {
    selectedDate: Date;
    onDateChange: (date : Date) => void;
    onViewChange: (view: string) => void;
    // Optional: signage (a public kiosk with no sign-in concept at all) renders this without
    // ever resolving a real admin status, CalendarHeader treats the resulting null the same as 
    // "not yet known" and skips the View-only pill either way, whereas the main calendar always 
    // supplies its resolved (or still-loading) boolean | null.
    isAdmin?: boolean | null;
    // Which way CalendarHeader's heading slides on a date/view change (see CalendarProvider's
    // changeSelectedDate) -- optional (not read from useCalendarContext directly) because
    // /signage renders this component with no CalendarProvider ancestor at all; defaults to
    // 'forward' there, so the heading still animates, just always in one direction.
    transitionDirection?: SwipeDirection;
  };

const CalendarNavbar: React.FC<CalendarNavbarProps> = ({
    selectedDate,
    onDateChange,
    onViewChange,
    isAdmin = null,
    transitionDirection = 'forward',
}) => {
    const [selectedView, setSelectedView] = useState('Day');

    const handleViewChange = (value: string) => {
      setSelectedView(value);
      onViewChange(value); // Call the external function
      onDateChange(new Date());
    };
  
    // Jumps to today's date within whatever view is currently active -- must not touch
    // selectedView (previously forced this to "Day" without telling the parent via
    // onViewChange, desyncing CalendarHeader's date-range label and shiftSelectedDate's own
    // day-vs-week step from whatever view was actually still rendered underneath).
    const handleToday = () => {
      onDateChange(new Date());
    };

    // Shifts the ET calendar date `selectedDate` represents by a day count (Day/Week) or month
    // count (Month), then hands back an ET-noon Date for the result -- noon (not midnight) so
    // re-deriving the ET date string from it later can't roll back a day, matching
    // WeekView.tsx's getFirstDayOfWeek/getDaysOfWeek convention.
    const shiftSelectedDate = (direction: 1 | -1) => {
      const etDateStr = formatETDateString(selectedDate);
      let newEtDateStr: string;
      switch (selectedView) {
        case 'Day':
          newEtDateStr = addDaysToETDateString(etDateStr, direction);
          break;
        case 'Week':
          newEtDateStr = addDaysToETDateString(etDateStr, direction * 7);
          break;
        case 'Month':
          newEtDateStr = addMonthsToETDateString(etDateStr, direction);
          break;
        default:
          newEtDateStr = etDateStr;
      }
      onDateChange(new Date(convertETToUTC(`${newEtDateStr}T12:00:00`)));
    };

    const handlePrevious = () => shiftSelectedDate(-1);
    const handleNext = () => shiftSelectedDate(1);

    const headingTransitionKey = computeHeadingTransitionKey(selectedView, selectedDate);

    return (
      <CalendarHeader
        selectedDate={selectedDate}
        selectedView={selectedView}
        isAdmin={isAdmin}
        animatedHeading={{ transitionKey: headingTransitionKey, direction: transitionDirection, axis: 'y' }}
      >
        <div className={styles.navbarControls}>
          <div className={styles.viewDropdown}>
            <Dropdown
              label=""
              value={selectedView}
              isVisible={true}
              elements={['Day', 'Week']}
              name="Select view"
              ariaLabel={selectedView}
              onChange={handleViewChange}
              renderElement={(element) => (
                <span className={styles.viewOption}>
                  <img src={VIEW_ICONS[element]} alt="" className={styles.viewOptionIcon} />
                  <span className={styles.viewOptionText}>{element}</span>
                </span>
              )}
            />
          </div>
          <div className={styles.box}>
            <a href="#" onClick={handleToday}>Today</a>
          </div>
          <div className={styles.dateToggle}>
            <img src="/svg/left-arrow.svg" alt="Left Arrow" width={24} height={24} onClick={handlePrevious} />
            <img src="/svg/right-arrow.svg" alt="Right Arrow" width={24} height={24} onClick={handleNext} />
          </div>
        </div>
      </CalendarHeader>
    );
  };
  
  export default CalendarNavbar;
  
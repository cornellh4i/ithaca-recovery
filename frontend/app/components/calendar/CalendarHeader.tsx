import React from 'react';
import styles from "../../../styles/components/calendar/CalendarNavbar.module.scss";
import { formatMeetingDateLine, monthNameForETDateString, formatMeetingWeekLine } from "../../../util/timeFormat";
import { formatETDateString } from "../../../util/timeUtils";

type CalendarHeaderProps = {
  selectedDate: Date;
  selectedView: string;
};

const CalendarHeader: React.FC<CalendarHeaderProps> = ({ selectedDate, selectedView }) => {
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

  return <h2 className={styles.navbarHeading}>{getDateRange(selectedDate)}</h2>;
};

export default CalendarHeader;

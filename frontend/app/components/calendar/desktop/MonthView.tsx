import React from "react";
import styles from "./MonthView.module.scss";
import { MeetingFilters } from "../../../../util/filters/meetingFilters";
import { useMonthMeetings } from "../../../../hooks/useMonthMeetings";
import TopLoadingBar from "../../ui/displays/TopLoadingBar";

interface MonthViewProps {
    filters: MeetingFilters;
    selectedDate: Date;
    refreshTrigger?: number;
}

// Placeholder for the desktop Month view (GitHub #459): view state, the 42-day grid window and
// its data fetch are wired up; the grid itself lands in #460.
const MonthView: React.FC<MonthViewProps> = ({ selectedDate, refreshTrigger = 0 }) => {
    const { isLoading } = useMonthMeetings(selectedDate, refreshTrigger);

    return (
        <div className={styles.outerContainer} data-testid="month-view">
            <TopLoadingBar active={isLoading} label="Loading meetings" />
            <p className={styles.placeholder}>Month view is in progress.</p>
        </div>
    );
};

export default MonthView;

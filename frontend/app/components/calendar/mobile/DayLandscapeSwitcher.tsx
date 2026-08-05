import React from "react";
import DayLandscapeView from "./DayLandscapeView";
import MultiDayLandscapeView from "./MultiDayLandscapeView";
import { useCalendarContext } from "../../../context/CalendarProvider";
import { MeetingFilters } from "../../../../util/meetingFilters";
import styles from "../../../../styles/components/calendar/mobile/DayLandscapeSwitcher.module.scss";

interface DayLandscapeSwitcherProps {
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

// Landscape phone's entry point: DayLandscapeView is the default (all rooms, one day, per the
// design handoff's prototype); MultiDayLandscapeView is the alternate. landscapeView itself
// lives in CalendarProvider, not local state -- see that context's comment for why.
const DayLandscapeSwitcher: React.FC<DayLandscapeSwitcherProps> = (props) => {
  const { landscapeView, setLandscapeView } = useCalendarContext();

  return (
    <div className={styles.container}>
      <div className={styles.viewToggle} role="tablist" aria-label="Landscape calendar view">
        <button
          type="button"
          role="tab"
          aria-selected={landscapeView === "day"}
          className={`${styles.toggleButton} ${landscapeView === "day" ? styles.active : ""}`}
          onClick={() => setLandscapeView("day")}
        >
          Day
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={landscapeView === "multiday"}
          className={`${styles.toggleButton} ${landscapeView === "multiday" ? styles.active : ""}`}
          onClick={() => setLandscapeView("multiday")}
        >
          Week
        </button>
      </div>
      {landscapeView === "day" ? <DayLandscapeView {...props} /> : <MultiDayLandscapeView {...props} />}
    </div>
  );
};

export default DayLandscapeSwitcher;

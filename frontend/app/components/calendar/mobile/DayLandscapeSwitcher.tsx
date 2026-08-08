import React from "react";
import DayLandscapeView from "./DayLandscapeView";
import MultiDayLandscapeView from "./MultiDayLandscapeView";
import { useCalendarContext } from "../../../context/CalendarProvider";
import { MeetingFilters } from "../../../../util/filters/meetingFilters";

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
// design handoff's prototype); MultiDayLandscapeView is the alternate, chosen via the Day/
// Multi-Day dropdown in MobileAppNavbar (not rendered here -- landscapeView lives in
// CalendarProvider so the navbar and this switcher can both read/drive the same choice, and
// it survives this component unmounting/remounting across an orientation round-trip).
const DayLandscapeSwitcher: React.FC<DayLandscapeSwitcherProps> = (props) => {
  const { landscapeView } = useCalendarContext();

  return landscapeView === "day" ? <DayLandscapeView {...props} /> : <MultiDayLandscapeView {...props} />;
};

export default DayLandscapeSwitcher;

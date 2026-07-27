import React, { useEffect, useState } from "react";
import styles from "../../(main)/page.module.scss";
import SignInPrompt from "./SignInPrompt";
import EditMeetingSidebar from "./EditMeeting";
import CalendarSidebar from "./CalendarSidebar";
import CompactCalendarSidebar from "./CompactCalendarSidebar";
import { useSidebar } from "../../context/SidebarContext";
import { IMeeting } from "../../../util/models";
import { MeetingFilters } from "../../../util/meetingFilters";

interface CalendarSidebarShellProps {
  isLoggedIn: boolean | null;
  filters: MeetingFilters;
  setFilters: React.Dispatch<React.SetStateAction<MeetingFilters>>;
  selectedDate: Date;
  setSelectedDate: React.Dispatch<React.SetStateAction<Date>>;
  selectedView: string;
  triggerCalendarRefresh: () => void;
  selectedMeeting: IMeeting | null;
  showEditMeeting: boolean;
  onCloseEdit: () => void;
}

const CalendarSidebarShell: React.FC<CalendarSidebarShellProps> = ({
  isLoggedIn,
  filters,
  setFilters,
  selectedDate,
  setSelectedDate,
  selectedView,
  triggerCalendarRefresh,
  selectedMeeting,
  showEditMeeting,
  onCloseEdit,
}) => {
  const { isCompact } = useSidebar();
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);

  // Switching Day/Week view backs out of the New Meeting form, back to the standard sidebar.
  useEffect(() => {
    setIsNewMeetingOpen(false);
  }, [selectedView]);

  const handleMiniCalendarSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleFilterChange = (name: string, value: boolean) => {
    setFilters((prev: typeof filters) => ({ ...prev, [name]: value }));
  };

  // ViewMeeting's popup is anchored to the clicked box's on-screen position -- scrolling the
  // sidebar while it's open just fights that anchoring instead of being useful.
  const isViewMeetingOpen = !!(selectedMeeting && !showEditMeeting);

  // Editing always shows the full-width form, regardless of the last compact/expanded choice.
  const isEditing = showEditMeeting && !!selectedMeeting;
  const isRailCompact = isLoggedIn === true && !isEditing && isCompact;

  return (
    <div
      className={styles.sidebar}
      style={{
        ...(isViewMeetingOpen ? { overflowY: "hidden" } : {}),
        ...(isRailCompact ? { width: 64, padding: "10px 0" } : {}),
      }}
    >
      {isLoggedIn === null ? null : !isLoggedIn ? (
        <SignInPrompt />
      ) : showEditMeeting && selectedMeeting ? (
        <EditMeetingSidebar
          meeting={selectedMeeting}
          onClose={onCloseEdit}
          onUpdateSuccess={() => {
            console.log("Meeting updated!");
            triggerCalendarRefresh();
          }}
        />
      ) : isCompact ? (
        <CompactCalendarSidebar />
      ) : (
        <CalendarSidebar
          filters={filters}
          isNewMeetingOpen={isNewMeetingOpen}
          setIsNewMeetingOpen={setIsNewMeetingOpen}
          handleFilterChange={handleFilterChange}
          handleMiniCalendarSelect={handleMiniCalendarSelect}
          selectedDate={selectedDate}
          selectedView={selectedView}
          triggerCalendarRefresh={triggerCalendarRefresh}
        />
      )}
    </div>
  );
};

export default CalendarSidebarShell;

import React, { useEffect, useState } from "react";
import styles from "../../(main)/page.module.scss";
import SignInPrompt from "./SignInPrompt";
import EditMeetingSidebar from "./EditMeeting";
import CalendarSidebar from "./CalendarSidebar";
import CompactCalendarSidebar from "./CompactCalendarSidebar";
import IconButton from "../atoms/IconButton";
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
  const { isCompact, collapseSidebar, expandSidebar } = useSidebar();
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

  // SignInPrompt/EditMeetingSidebar have nothing to collapse -- the toggle only makes sense
  // once the full or compact CalendarSidebar is what's actually showing.
  const showSidebarToggle = isLoggedIn === true && !isEditing;

  return (
    <div
      className={styles.sidebar}
      style={isRailCompact ? { width: 64, padding: "10px 0" } : undefined}
    >
      <div
        className={styles.sidebarScroll}
        style={isViewMeetingOpen ? { overflowY: "hidden" } : undefined}
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
      {showSidebarToggle && (
        <div className={styles.sidebarToggleWrapper}>
          <IconButton
            icon={<img src={isCompact ? "/svg/chevron-right-icon.svg" : "/svg/chevron-left-icon.svg"} alt="" />}
            ariaLabel={isCompact ? "Show calendar sidebar" : "Collapse sidebar"}
            tooltip={isCompact ? "Show calendar sidebar" : "Collapse sidebar"}
            variant="outlined"
            size="compact"
            onClick={isCompact ? expandSidebar : collapseSidebar}
          />
        </div>
      )}
    </div>
  );
};

export default CalendarSidebarShell;

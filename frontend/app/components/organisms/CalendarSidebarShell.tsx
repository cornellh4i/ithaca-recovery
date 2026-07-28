import React, { useEffect, useRef, useState } from "react";
import styles from "../../(main)/page.module.scss";
import SignInPrompt from "./SignInPrompt";
import EditMeetingSidebar from "./EditMeeting";
import CalendarSidebar from "./CalendarSidebar";
import CompactCalendarSidebar from "./CompactCalendarSidebar";
import IconButton from "../atoms/IconButton";
import { useSidebar } from "../../context/SidebarContext";
import { useBreakpoint } from "../../../hooks/useBreakpoint";
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

// Matches the opacity transition duration set on .sidebarLayerFading in page.module.scss --
// kept in sync manually (CSS durations aren't readable from JS) so the outgoing layer is
// unmounted right as its fade-out finishes, not before (cutting the animation short) or
// noticeably after (leaving a dead, already-invisible node around).
const SIDEBAR_FADE_MS = 200;

type SidebarMode = "full" | "compact";

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
  useBreakpoint(collapseSidebar);

  // Drives the full <-> compact cross-fade. renderedMode is the "live" (interactive) variant;
  // outgoingMode, when set, is the previous variant still mounted just long enough to fade out
  // on top of it. Both use a stable `key` per mode (see render below) so React updates the
  // existing DOM node's class instead of remounting it -- remounting would mean the node never
  // painted at opacity: 1 first, so there'd be nothing for the CSS transition to animate from.
  const [renderedMode, setRenderedMode] = useState<SidebarMode>(isCompact ? "compact" : "full");
  const [outgoingMode, setOutgoingMode] = useState<SidebarMode | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const nextMode: SidebarMode = isCompact ? "compact" : "full";
    setRenderedMode((current) => {
      if (current === nextMode) return current;
      setOutgoingMode(current);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = setTimeout(() => setOutgoingMode(null), SIDEBAR_FADE_MS);
      return nextMode;
    });
  }, [isCompact]);

  useEffect(
    () => () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    },
    []
  );

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
      style={isRailCompact ? { width: 64, padding: "0 24px 0 0" } : undefined}
    >
      {isLoggedIn === null ? null : !isLoggedIn ? (
        <div className={styles.sidebarScroll}>
          <SignInPrompt />
        </div>
      ) : showEditMeeting && selectedMeeting ? (
        <div className={styles.sidebarScroll} style={isViewMeetingOpen ? { overflowY: "hidden" } : undefined}>
          <EditMeetingSidebar
            meeting={selectedMeeting}
            onClose={onCloseEdit}
            onUpdateSuccess={() => {
              console.log("Meeting updated!");
              triggerCalendarRefresh();
            }}
          />
        </div>
      ) : (
        <div className={styles.sidebarSwap}>
          {(renderedMode === "full" || outgoingMode === "full") && (
            <div
              key="full"
              className={[
                styles.sidebarLayer,
                styles.sidebarLayerFull,
                outgoingMode === "full" ? styles.sidebarLayerFading : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden={outgoingMode === "full" ? true : undefined}
              style={outgoingMode === "full" ? { pointerEvents: "none" } : undefined}
            >
              <div className={styles.sidebarScroll} style={isViewMeetingOpen ? { overflowY: "hidden" } : undefined}>
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
              </div>
            </div>
          )}
          {(renderedMode === "compact" || outgoingMode === "compact") && (
            <div
              key="compact"
              className={
                outgoingMode === "compact"
                  ? [styles.sidebarLayer, styles.sidebarLayerFading].join(" ")
                  : styles.sidebarLayer
              }
              aria-hidden={outgoingMode === "compact" ? true : undefined}
              style={outgoingMode === "compact" ? { pointerEvents: "none" } : undefined}
            >
              {/* Unlike the full sidebar's layer above, this isn't wrapped in .sidebarScroll --
                  that div's overflow-y: auto forces overflow-x to compute as auto too (same
                  clipping quirk as the toggle button's tooltip, see .sidebar's comment in
                  page.module.scss), which would clip the rail's flyouts where they pop out
                  past the 64px rail's edge. */}
              <CompactCalendarSidebar
                filters={filters}
                handleFilterChange={handleFilterChange}
                selectedDate={selectedDate}
                handleMiniCalendarSelect={handleMiniCalendarSelect}
                onOpenNewMeeting={() => {
                  expandSidebar();
                  setIsNewMeetingOpen(true);
                }}
              />
            </div>
          )}
        </div>
      )}
      {showSidebarToggle && (
        <div className={styles.sidebarToggleWrapper}>
          <IconButton
            icon={<img src={isCompact ? "/svg/chevron-right-icon.svg" : "/svg/chevron-left-icon.svg"} alt="" />}
            ariaLabel={isCompact ? "Show calendar sidebar" : "Collapse sidebar"}
            tooltip={isCompact ? "Show calendar sidebar" : "Collapse sidebar"}
            tooltipAlign={isCompact ? "left" : "center"}
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

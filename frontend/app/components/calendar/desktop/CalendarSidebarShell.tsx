import React, { useEffect, useRef, useState } from "react";
import styles from "../../../(main)/page.module.scss";
import EditMeetingSidebar from "../../meeting-form/EditMeeting";
import CalendarSidebar from "./CalendarSidebar";
import CompactCalendarSidebar from "./CompactCalendarSidebar";
import IconButton from "../../atoms/IconButton";
import { useSidebar } from "../../../context/SidebarContext";
import { useBreakpoint } from "../../../../hooks/useBreakpoint";
import { IMeeting } from "../../../../util/models";
import { MeetingFilters } from "../../../../util/meetingFilters";

interface CalendarSidebarShellProps {
  isLoggedIn: boolean | null;
  isAdmin: boolean | null;
  filters: MeetingFilters;
  setFilters: React.Dispatch<React.SetStateAction<MeetingFilters>>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  selectedView: string;
  triggerCalendarRefresh: () => void;
  selectedMeeting: IMeeting | null;
  showEditMeeting: boolean;
  onCloseEdit: () => void;
  // Lifted to HomePage so mobile's full-screen New Meeting form (a separate render path,
  // this shell isn't mounted at all on phone) shares the same source of truth instead of a
  // second, independent boolean.
  isNewMeetingOpen: boolean;
  setIsNewMeetingOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

// Matches the staggered fade durations set on .sidebarLayerOutgoing/.sidebarLayerEntered in
// page.module.scss -- kept in sync manually (CSS durations aren't readable from JS). The
// outgoing layer fades out immediately (no delay); the incoming layer waits out the delay
// before fading in, so there's a brief gap where neither is visible instead of the two
// cross-fading over each other. The outgoing layer is unmounted once the whole sequence
// (delay + incoming fade-in) has finished.
const SIDEBAR_INCOMING_DELAY_MS = 150;
const SIDEBAR_INCOMING_FADE_MS = 120;
const SIDEBAR_TOTAL_TRANSITION_MS = SIDEBAR_INCOMING_DELAY_MS + SIDEBAR_INCOMING_FADE_MS;

type SidebarMode = "full" | "compact";

// Outgoing layers fade out immediately; the live layer fades in only once it's been flipped
// past its pre-transition mount state (see the `entered` state in the component below).
function sidebarLayerTransitionClass(
  mode: SidebarMode,
  renderedMode: SidebarMode,
  outgoingMode: SidebarMode | null,
  entered: boolean
): string {
  if (outgoingMode === mode) return styles.sidebarLayerOutgoing;
  if (renderedMode === mode) return entered ? styles.sidebarLayerEntered : styles.sidebarLayerEntering;
  return "";
}

const CalendarSidebarShell: React.FC<CalendarSidebarShellProps> = ({
  isLoggedIn,
  isAdmin,
  filters,
  setFilters,
  selectedDate,
  setSelectedDate,
  selectedView,
  triggerCalendarRefresh,
  selectedMeeting,
  showEditMeeting,
  onCloseEdit,
  isNewMeetingOpen,
  setIsNewMeetingOpen,
}) => {
  const { isCompact, collapseSidebar, expandSidebar } = useSidebar();
  useBreakpoint(collapseSidebar, expandSidebar);

  // Drives the full <-> compact staggered cross-fade. renderedMode is the "live" (interactive)
  // variant; outgoingMode, when set, is the previous variant still mounted long enough to fade
  // out on top of it. Both use a stable `key` per mode (see render below) so React updates the
  // existing DOM node's class instead of remounting it -- remounting would mean the node never
  // painted at opacity: 1 first, so there'd be nothing for the CSS transition to animate from.
  //
  // `entered` tracks whether the current renderedMode's layer has been flipped from its
  // pre-transition mount state (opacity 0, no transition -- .sidebarLayerEntering) to its
  // animating-in state (opacity 1, transition delayed by SIDEBAR_INCOMING_DELAY_MS --
  // .sidebarLayerEntered). CSS transitions only animate a *change* observed after a paint, so a
  // freshly-mounted layer has to sit at opacity 0 for a frame before switching classes, or there
  // would be nothing for the browser to interpolate from.
  const [renderedMode, setRenderedMode] = useState<SidebarMode>(isCompact ? "compact" : "full");
  const [outgoingMode, setOutgoingMode] = useState<SidebarMode | null>(null);
  const [entered, setEntered] = useState(true);
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRafRef = useRef<number[]>([]);

  useEffect(() => {
    const nextMode: SidebarMode = isCompact ? "compact" : "full";
    setRenderedMode((current) => {
      if (current === nextMode) return current;
      setOutgoingMode(current);
      setEntered(false);
      if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = setTimeout(() => setOutgoingMode(null), SIDEBAR_TOTAL_TRANSITION_MS);
      return nextMode;
    });
  }, [isCompact]);

  // Flips the incoming layer from its pre-transition mount state to its animating-in state one
  // paint later. Double rAF (rather than a single one) reliably lands after React's commit has
  // actually painted the opacity: 0 state, which a single rAF can sometimes race.
  useEffect(() => {
    if (entered) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setEntered(true));
      enterRafRef.current.push(raf2);
    });
    enterRafRef.current.push(raf1);
    return () => {
      enterRafRef.current.forEach(cancelAnimationFrame);
      enterRafRef.current = [];
    };
  }, [entered, renderedMode]);

  useEffect(
    () => () => {
      if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
      enterRafRef.current.forEach(cancelAnimationFrame);
    },
    []
  );

  // Switching Day/Week view backs out of the New Meeting form, back to the standard sidebar.
  useEffect(() => {
    setIsNewMeetingOpen(false);
  }, [selectedView]);

  // Opening New Meeting from the compact rail force-expands the sidebar (the form needs the
  // full 280px width) -- stashedCompactRef remembers that this expand was forced rather than
  // user-chosen, so closing the form can put the rail back instead of leaving it expanded.
  // Edit Meeting doesn't need this: it overrides its own width via isRailCompact below without
  // ever touching isCompact, so there's nothing to restore there.
  const stashedCompactRef = useRef(false);
  const wasNewMeetingOpenRef = useRef(isNewMeetingOpen);

  useEffect(() => {
    const wasOpen = wasNewMeetingOpenRef.current;
    wasNewMeetingOpenRef.current = isNewMeetingOpen;
    if (wasOpen && !isNewMeetingOpen && stashedCompactRef.current) {
      collapseSidebar();
    }
    if (!isNewMeetingOpen) {
      stashedCompactRef.current = false;
    }
  }, [isNewMeetingOpen, collapseSidebar]);

  const handleMiniCalendarSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleFilterChange = (name: string, value: boolean) => {
    setFilters((prev: typeof filters) => ({ ...prev, [name]: value }));
  };

  // ViewMeeting's popup is anchored to the clicked box's on-screen position -- scrolling the
  // sidebar while it's open just fights that anchoring instead of being useful.
  const isViewMeetingOpen = !!(selectedMeeting && !showEditMeeting);

  // New and Editing Meeting always shows the full-width form, regardless of the last compact/expanded choice.
  // Both are admin-only -- a non-admin whose showEditMeeting/isNewMeetingOpen somehow got set
  // (e.g. a stale deep link) falls through to the ordinary sidebar below instead of the form.
  const isEditing = showEditMeeting && !!selectedMeeting && isAdmin;
  const isRailCompact = !isEditing && !isNewMeetingOpen && isCompact;

  // EditMeetingSidebar has nothing to collapse -- the toggle only makes sense once the full
  // or compact CalendarSidebar is what's actually showing. Shown for every visitor now (not
  // just logged-in ones) since the mini calendar/filters underneath are visible to everyone.
  const showSidebarToggle = !isEditing && !isNewMeetingOpen;

  return (
    <div
      className={styles.sidebar}
      style={isRailCompact ? { width: 64, padding: "0 24px 0 0" } : undefined}
    >
      {isLoggedIn === null ? null : showEditMeeting && selectedMeeting && isAdmin ? (
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
                sidebarLayerTransitionClass("full", renderedMode, outgoingMode, entered),
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
                  isAdmin={isAdmin}
                />
              </div>
            </div>
          )}
          {(renderedMode === "compact" || outgoingMode === "compact") && (
            <div
              key="compact"
              className={[
                styles.sidebarLayer,
                sidebarLayerTransitionClass("compact", renderedMode, outgoingMode, entered),
              ]
                .filter(Boolean)
                .join(" ")}
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
                  stashedCompactRef.current = isCompact;
                  expandSidebar();
                  setIsNewMeetingOpen(true);
                }}
                isAdmin={isAdmin}
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

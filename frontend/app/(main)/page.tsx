"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.scss";
import CalendarNavbar from "../components/calendar/desktop/CalendarNavbar";
import CalendarSidebarShell from "../components/calendar/desktop/CalendarSidebarShell";
import ViewMeetingDetails from "../components/meeting-form/ViewMeeting";
import DayView from "../components/calendar/desktop/DayView";
import WeekView from "../components/calendar/desktop/WeekView";
import DayPortraitView from "../components/calendar/mobile/DayPortraitView";
import DayLandscapeSwitcher from "../components/calendar/mobile/DayLandscapeSwitcher";
import MobileFullScreenSheet from "../components/ui/overlays/MobileFullScreenSheet";
import MobileFab from "../components/calendar/mobile/MobileFab";
import NewMeetingSidebar from "../components/meeting-form/NewMeeting";
import EditMeetingSidebar from "../components/meeting-form/EditMeeting";

import { convertUTCToET } from "../../util/date/timeUtils";
import { IMeeting } from "../../types/models";
import { useConflictMids } from "../../hooks/useConflictMids";
import { useSyncErrorMids } from "../../hooks/useSyncErrorMids";
import { useViewport } from "../../hooks/useViewport";
import { PHONE_BREAKPOINT } from "../../util/common/breakpoints";
import { useCalendarContext } from "../context/CalendarProvider";
import { useToast } from "../components/shared/ToastProvider";

export default function HomePage() {
  const { showToast } = useToast();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  // null until the auth check below resolves -- lets consumers that need to distinguish
  // "don't know yet" from "confirmed not admin" (e.g. CalendarHeader's View-only pill) avoid
  // flashing admin-gated UI in its wrong state during that initial fetch.
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  // Admin-only -- the endpoint itself rejects non-admins, so gate on role (not just being
  // signed in) to avoid every non-admin viewer firing a denied request on mount and every
  // 30s refresh (see useConflictMids' `enabled` param).
  const { mids: conflictMids, counts: conflictCounts } = useConflictMids(refreshTrigger, isAdmin);
  // Same admin gate/refresh cadence as conflictMids above (see useSyncErrorMids) -- backs the
  // calendar block's sync-error badge, previously always false for every viewer (including
  // admins) since googleSyncStatus/zoomSyncStatus are deliberately excluded from the public
  // meeting payload the Day/Week views otherwise read from (see util/meetings/publicMeeting.ts).
  const syncErrorMids = useSyncErrorMids(refreshTrigger, isAdmin);

  const triggerCalendarRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log("Auto-refreshing calendar (30s interval)");
      triggerCalendarRefresh();
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [triggerCalendarRefresh]);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/status');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setIsLoggedIn(data.isAuthenticated);
        setIsAdmin(data.role === "ADMIN" || data.role === "SUPER_ADMIN");
      } catch (error) {
        console.error("Error checking authentication status:", error);
        setIsLoggedIn(false);
        setIsAdmin(false);
      }
    };

    checkAuthStatus();
  }, []);

  const {
    selectedDate,
    changeSelectedDate,
    selectedView,
    setSelectedView,
    dayFilters,
    setDayFilters,
    weekFilters,
    setWeekFilters,
    transitionDirection,
  } = useCalendarContext();
  const [selectedMeeting, setSelectedMeeting] = useState<IMeeting | null>(null);
  const [selectedMeetingID, setSelectedMeetingID] = useState<string | null>(null);
  const [, setSelectedNewMeeting] = useState<boolean | null>(false);
  const [showEditMeeting, setShowEditMeeting] = useState(false);
  // Lifted here (rather than owned by CalendarSidebarShell, which isn't mounted at all on
  // phone) so mobile's full-screen New Meeting form and desktop's embedded sidebar form
  // share one source of truth.
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [lastClickedDate, setLastClickedDate] = useState<Date | null>(null);
  // The clicked meeting box, so the View Meeting popup can anchor itself beside it.
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const fetchMeetingDetails = useCallback(async (meetingId: string) => {
    try {
      const response = await fetch(`/api/retrieve/meeting/${meetingId}`, { method: 'GET' });
      if (response.ok) {
        const data: IMeeting = await response.json();
        // Batched: keeps the old panel on screen until the new meeting is ready.
        setShowEditMeeting(false);
        setSelectedMeeting(data);
        // lastClickedDate is set directly by the calendar box's own click handler (see
        // setLastClickedDate threaded into DayView/WeekView/DayPortraitView) --
        // it already knows which specific occurrence's column/row was clicked, which the
        // globally-selected calendar date does not (e.g. Week view can have a different
        // selectedDate than the day column actually clicked). Left unset here for the
        // deep-link (?mid=) path, which has no click to attribute a date to.
      } else {
        console.error("Failed to fetch meeting details");
      }
    } catch (error) {
      console.error('Error fetching meeting details:', error);
    }
  }, []);

  useEffect(() => {
    if (selectedMeetingID) {
      // Async fetch-then-set; the lint rule can't see the setState calls sit after an
      // await, so this is a false positive for the standard "load on ID change" pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchMeetingDetails(selectedMeetingID);
    } else {
      setShowEditMeeting(false);
      setSelectedMeeting(null);
      setLastClickedDate(null);
    }
  }, [selectedMeetingID, fetchMeetingDetails]);

  // Deep-link support for e.g. the Diagnostics conflicts panel's "Edit" button
  // (/?mid=<id>&edit=1) -- read once on mount rather than via useSearchParams, since this
  // page isn't wrapped in a Suspense boundary.
  const [pendingEditFromUrl, setPendingEditFromUrl] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mid = params.get("mid");
    if (mid) {
      setPendingEditFromUrl(params.get("edit") === "1");
      setSelectedMeetingID(mid);
    }
  }, []);

  useEffect(() => {
    if (selectedMeeting && pendingEditFromUrl) {
      setShowEditMeeting(true);
      setPendingEditFromUrl(false);
    }
  }, [selectedMeeting, pendingEditFromUrl]);

  const handleBack = () => {
    setSelectedMeeting(null);
    setSelectedMeetingID(null);
    setSelectedNewMeeting(false);
    setLastClickedDate(null);
    setAnchorEl(null);
  };

  // Switching Day/Week view backs out to neutral (CalendarSidebar, no popup) entirely --
  // not just closing Edit, since the clicked box's anchorEl also goes stale across the
  // switch (Day view's boxes aren't in the DOM once Week view renders, and vice versa),
  // so leaving the View Meeting popup open underneath would anchor to a detached element.
  // Skipped on mount: this effect also fires on initial render (selectedView's first value
  // counts as a "change"), which would race the deep-link effect above and immediately
  // clear the ?mid=&edit=1 selection it just queued.
  const isInitialViewRender = useRef(true);
  useEffect(() => {
    if (isInitialViewRender.current) {
      isInitialViewRender.current = false;
      return;
    }
    handleBack();
    setShowEditMeeting(false);
  }, [selectedView]);

  const handleOpenEdit = () => {
    setShowEditMeeting(true);
  };

  const handleCloseEdit = () => {
    setShowEditMeeting(false);
    // Backing out of Edit goes straight to neutral (CalendarSidebar, no popup) rather than
    // revealing the View Meeting popup underneath and requiring a second "back" click.
    handleBack();
  };

  const handleDelete = async (mid: string, deleteOption?: 'this' | 'thisAndFollowing' | 'all') => {
    try {
      const response = await fetch('/api/delete/meeting', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mid,
          deleteOption,
          occurrenceDate: lastClickedDate?.toISOString(),
        }),
      });

      if (!response.ok) {
        showToast({ variant: "error", title: "Unsuccessful delete" });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Clear selected meeting state

      setSelectedMeeting(null);
      setSelectedMeetingID(null);
      setLastClickedDate(null);

       // Trigger calendar refresh
      triggerCalendarRefresh();

      showToast({ variant: "success", title: "Meeting deleted successfully." });

    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleSuspend = async (mid: string, resumesAt: string | null, from: string) => {
    try {
      const response = await fetch('/api/update/meeting/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mid, to: resumesAt, from }),
      });
      if (!response.ok) {
        // Previously a generic "could not suspend" regardless of cause -- e.g. the 409 a race
        // against another unresolved suspension returns (see suspend/route.ts) would show no
        // useful detail at all.
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `HTTP error! status: ${response.status}`);
      }

      handleBack();
      triggerCalendarRefresh();
      showToast({ variant: "success", title: "Meeting suspended successfully." });
    } catch (error) {
      console.error('There was an error suspending the meeting:', error);
      showToast({
        variant: "error",
        title: `Could not suspend the meeting${error instanceof Error ? ` (${error.message})` : ""}`,
      });
    }
  };

  const handleResume = async (mid: string, on?: string | null) => {
    try {
      const response = await fetch('/api/update/meeting/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(on ? { mid, on } : { mid }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `HTTP error! status: ${response.status}`);
      }

      handleBack();
      triggerCalendarRefresh();
      showToast({ variant: "success", title: "Meeting resumed successfully." });
    } catch (error) {
      console.error('There was an error resuming the meeting:', error);
      showToast({
        variant: "error",
        title: `Could not resume the meeting${error instanceof Error ? ` (${error.message})` : ""}`,
      });
    }
  };

  const filters = selectedView === "Day" ? dayFilters : weekFilters;
  const setFilters = selectedView === "Day" ? setDayFilters : setWeekFilters;
  const convertESTStringToDate = (estDateString: string): Date => {
    // Extract date and time parts from the EST string (e.g., "04/09/2025, 06:00:00 AM")
    const [datePart, timePart] = estDateString.split(', ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute, second] = timePart.split(':');
    const [seconds, period] = second.split(' '); // Extract AM/PM

    // Convert hour from 12-hour format to 24-hour format
    let hours = parseInt(hour);
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    // Build a formatted ISO date string and create a Date object
    const isoDateString = `${year}-${month}-${day}T${hours.toString().padStart(2, '0')}:${minute}:${seconds}`;
    return new Date(isoDateString);
  };

  // ViewMeeting's popup is anchored to the clicked box's on-screen position -- scrolling
  // either the sidebar or the calendar grid underneath it while it's open just fights that
  // anchoring instead of being useful, so both are locked while it's showing.
  const isViewMeetingOpen = !!(selectedMeeting && !showEditMeeting);

  const viewport = useViewport();
  const isPhone = viewport?.device === "phone";
  const isLandscapePhone = isPhone && viewport?.orientation === "landscape";

  // Same null-during-resolution guard as AppNavigation: viewport starts null until the client's
  // first layout effect measures it, and both branches below treat a null viewport as
  // "desktop" -- without this, every load would flash the desktop sidebar/grid first.
  if (viewport === null) {
    return null;
  }

  return (
    <div className={styles.container}>
      {/* No sidebar on mobile -- filters/mini-calendar move into MobileAppNavigation's bottom
          sheets instead (see CalendarProvider/MobileAppNavigation); New/Edit Meeting instead get
          the full-screen sheets rendered below. */}
      {!isPhone && (
        <CalendarSidebarShell
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          filters={filters}
          setFilters={setFilters}
          selectedDate={selectedDate}
          setSelectedDate={changeSelectedDate}
          selectedView={selectedView}
          triggerCalendarRefresh={triggerCalendarRefresh}
          selectedMeeting={selectedMeeting}
          showEditMeeting={showEditMeeting}
          onCloseEdit={handleCloseEdit}
          isNewMeetingOpen={isNewMeetingOpen}
          setIsNewMeetingOpen={setIsNewMeetingOpen}
        />
      )}
      {isPhone && isAdmin && (
        <React.Fragment>
          <MobileFullScreenSheet isOpen={isNewMeetingOpen}>
            <NewMeetingSidebar
              setIsNewMeetingOpen={setIsNewMeetingOpen}
              triggerCalendarRefresh={triggerCalendarRefresh}
              selectedDate={selectedDate}
              selectedView={selectedView}
            />
          </MobileFullScreenSheet>
          <MobileFullScreenSheet isOpen={showEditMeeting && !!selectedMeeting}>
            {selectedMeeting && (
              <EditMeetingSidebar
                meeting={selectedMeeting}
                onClose={handleCloseEdit}
                onUpdateSuccess={triggerCalendarRefresh}
              />
            )}
          </MobileFullScreenSheet>
          <MobileFab onClick={() => setIsNewMeetingOpen(true)} />
        </React.Fragment>
      )}
      {selectedMeeting && !showEditMeeting && (
        <ViewMeetingDetails
          key={selectedMeeting.mid}
          mid={selectedMeeting.mid}
          title={selectedMeeting.title}
          description={selectedMeeting.description}
          creator={selectedMeeting.creator}
          group={selectedMeeting.group}

          startDateTime={convertESTStringToDate(
            convertUTCToET(
              selectedMeeting.startDateTime instanceof Date
                ? selectedMeeting.startDateTime.toISOString()
                : selectedMeeting.startDateTime
            )
          )}

          endDateTime={convertESTStringToDate(
            convertUTCToET(
              selectedMeeting.endDateTime instanceof Date
                ? selectedMeeting.endDateTime.toISOString()
                : selectedMeeting.endDateTime
            )
          )}

          email={selectedMeeting.email}

          zoomRoom={selectedMeeting.zoomRoom}
          zoomLink={selectedMeeting.zoomLink}
          zid={selectedMeeting.zid}
          zoomPasscode={selectedMeeting.zoomPasscode}
          zoomInvitation={selectedMeeting.zoomInvitation}
          zoomHost={selectedMeeting.zoomHost}
          modeType={selectedMeeting.modeType}
          calType={selectedMeeting.calType}
          room={selectedMeeting.room}
          isRecurring={selectedMeeting.isRecurring ?? false}
          recurrencePattern={selectedMeeting.recurrencePattern || undefined}
          googleSyncStatus={selectedMeeting.googleSyncStatus}
          googleSyncError={selectedMeeting.googleSyncError}
          zoomSyncStatus={selectedMeeting.zoomSyncStatus}
          zoomSyncError={selectedMeeting.zoomSyncError}
          resumesAt={selectedMeeting.resumesAt}
          suspendedSince={selectedMeeting.suspendedSince}
          suspensionActive={selectedMeeting.suspensionActive}
          conflictCount={conflictCounts.get(selectedMeeting.mid) ?? 0}
          currentOccurrenceDate={lastClickedDate || undefined} // Pass the date when the meeting was clicked
          anchorEl={anchorEl}
          isPhone={isPhone}
          isAdmin={isAdmin}
          onBack={handleBack}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onSuspend={handleSuspend}
          onResume={handleResume}
          onSyncSuccess={triggerCalendarRefresh}
        />
      )}
      <div className={styles.primaryCalendar}>
        {viewport?.isTransitioning &&
        (isPhone || Math.min(window.innerWidth, window.innerHeight) <= PHONE_BREAKPOINT) ? (
          // A phone rotating (or resizing across the phone/tablet breakpoint) reports its new
          // physical dimensions well before useViewport's own debounced re-render catches up --
          // without this, DayPortraitView/DayLandscapeSwitcher would render in the *old*
          // orientation's shape, squeezed into the *new* dimensions, for that whole window.
          // Blank instead until the real swap is ready. Checked against the raw window
          // dimensions too (not just the debounced isPhone), since a desktop/tablet viewport
          // transitioning INTO phone size reports isPhone=false for the whole debounce window.
          <div className={styles.orientationTransitionBuffer} />
        ) : isLandscapePhone ? (
          <DayLandscapeSwitcher
            filters={dayFilters}
            selectedDate={selectedDate}
            selectedMeetingID={selectedMeetingID}
            setSelectedMeetingID={setSelectedMeetingID}
            selectedOccurrenceDate={lastClickedDate}
            setSelectedNewMeeting={setSelectedNewMeeting}
            setAnchorEl={setAnchorEl}
            setLastClickedDate={setLastClickedDate}
            refreshTrigger={refreshTrigger}
            scrollLocked={isViewMeetingOpen}
            conflictMids={conflictMids}
            syncErrorMids={syncErrorMids}
          />
        ) : isPhone ? (
          <DayPortraitView
            filters={dayFilters}
            selectedDate={selectedDate}
            selectedMeetingID={selectedMeetingID}
            setSelectedMeetingID={setSelectedMeetingID}
            selectedOccurrenceDate={lastClickedDate}
            setSelectedNewMeeting={setSelectedNewMeeting}
            setAnchorEl={setAnchorEl}
            setLastClickedDate={setLastClickedDate}
            refreshTrigger={refreshTrigger}
            scrollLocked={isViewMeetingOpen}
            conflictMids={conflictMids}
            syncErrorMids={syncErrorMids}
            isAdmin={isAdmin}
          />
        ) : (
          <React.Fragment>
            <CalendarNavbar
              selectedDate={selectedDate}
              onDateChange={changeSelectedDate}
              selectedView={selectedView}
              onViewChange={setSelectedView}
              isAdmin={isAdmin}
              transitionDirection={transitionDirection}
            />
            {selectedView === "Day" ? (
              <DayView
                filters={filters}
                selectedDate={selectedDate}
                setSelectedDate={changeSelectedDate}
                selectedMeetingID={selectedMeetingID}
                setSelectedMeetingID={setSelectedMeetingID}
                selectedOccurrenceDate={lastClickedDate}
                setSelectedNewMeeting={setSelectedNewMeeting}
                setAnchorEl={setAnchorEl}
                setLastClickedDate={setLastClickedDate}
                refreshTrigger={refreshTrigger}
                scrollLocked={isViewMeetingOpen}
                conflictMids={conflictMids}
                syncErrorMids={syncErrorMids}
                transitionDirection={transitionDirection}
              />
            ) : (
              <WeekView
                filters={filters}
                selectedDate={selectedDate}
                setSelectedDate={changeSelectedDate}
                selectedMeetingID={selectedMeetingID}
                setSelectedMeetingID={setSelectedMeetingID}
                selectedOccurrenceDate={lastClickedDate}
                setSelectedNewMeeting={setSelectedNewMeeting}
                setAnchorEl={setAnchorEl}
                setLastClickedDate={setLastClickedDate}
                refreshTrigger={refreshTrigger}
                scrollLocked={isViewMeetingOpen}
                conflictMids={conflictMids}
                syncErrorMids={syncErrorMids}
                transitionDirection={transitionDirection}
              />
            )}
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

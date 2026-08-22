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
import NewMeetingSidebar, { type NewMeetingSidebarHandle } from "../components/meeting-form/NewMeeting";
import EditMeetingSidebar from "../components/meeting-form/EditMeeting";

import { IMeeting } from "../../types/models";
import { useConflictMids } from "../../hooks/useConflictMids";
import { useSyncErrorMids } from "../../hooks/useSyncErrorMids";
import { useMeetingDetailsSync } from "../../hooks/useMeetingDetailsSync";
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
  // Lets the mobile sheet's Escape-to-close (MobileFullScreenSheet's onClose) trigger the same
  // reset-then-close NewMeetingSidebar's own Cancel/X button uses, instead of a bare
  // setIsNewMeetingOpen(false) that would skip resetForm().
  const newMeetingRef = useRef<NewMeetingSidebarHandle>(null);
  const [lastClickedDate, setLastClickedDate] = useState<Date | null>(null);
  // The clicked meeting box, so the View Meeting popup can anchor itself beside it.
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // Keeps selectedMeeting in sync with selectedMeetingID and refreshTrigger -- see the hook's
  // own doc comment for why a background refresh must never force-close an open Edit panel.
  useMeetingDetailsSync({
    selectedMeetingID,
    refreshTrigger,
    setSelectedMeeting,
    setShowEditMeeting,
    setLastClickedDate,
  });

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
  // Guarded by comparing against the previous view rather than a "skip first run" flag: this
  // effect also fires on initial render (selectedView's first value counts as a "change"),
  // which would race the deep-link effect above and immediately clear the ?mid=&edit=1
  // selection it just queued. A first-run flag isn't replay-safe -- refs survive dev-mode
  // StrictMode effect replays (Next >= 16.3.0) while the effect re-runs, so the replayed run
  // would see the flag already cleared and wipe the deep-link selection.
  const prevSelectedView = useRef(selectedView);
  useEffect(() => {
    if (prevSelectedView.current === selectedView) {
      return;
    }
    prevSelectedView.current = selectedView;
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
          occurrenceDate={lastClickedDate}
        />
      )}
      {isPhone && isAdmin && (
        <React.Fragment>
          <MobileFullScreenSheet
            isOpen={isNewMeetingOpen}
            onClose={() => {
              // Routes through the same resetForm()-then-close path the in-form Cancel/X
              // button uses (see NewMeetingSidebarHandle) rather than a bare
              // setIsNewMeetingOpen(false) -- falls back to the bare close only if the ref
              // somehow isn't attached yet (shouldn't happen: onClose only fires while the
              // sheet, and therefore its child, is open).
              if (newMeetingRef.current) {
                newMeetingRef.current.requestClose();
              } else {
                setIsNewMeetingOpen(false);
              }
            }}
            ariaLabel="New Meeting"
          >
            <NewMeetingSidebar
              ref={newMeetingRef}
              setIsNewMeetingOpen={setIsNewMeetingOpen}
              triggerCalendarRefresh={triggerCalendarRefresh}
              selectedDate={selectedDate}
              selectedView={selectedView}
            />
          </MobileFullScreenSheet>
          <MobileFullScreenSheet
            isOpen={showEditMeeting && !!selectedMeeting}
            onClose={handleCloseEdit}
            ariaLabel="Edit Meeting"
          >
            {selectedMeeting && (
              <EditMeetingSidebar
                meeting={selectedMeeting}
                onClose={handleCloseEdit}
                onUpdateSuccess={triggerCalendarRefresh}
                occurrenceDate={lastClickedDate}
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
          lastEditedBy={selectedMeeting.lastEditedBy}
          zoomManaged={selectedMeeting.zoomManaged}
          sharedWith={selectedMeeting.sharedWith}
          zoomScheduleDiverged={selectedMeeting.zoomScheduleDiverged}
          group={selectedMeeting.group}

          /* ViewMeetingDetails formats for ET display internally (formatETDateString, etTimeFmt,
             etc.) given a real UTC instant -- pass selectedMeeting's UTC value straight through,
             not via an intermediate ET-formatted string. A "07/01/2026, 07:00:00 AM" string has
             no timezone of its own; re-parsing it with `new Date(string)` resolves it in the
             runtime's local timezone, not ET. */
          startDateTime={selectedMeeting.startDateTime instanceof Date
            ? selectedMeeting.startDateTime
            : new Date(selectedMeeting.startDateTime)}

          endDateTime={selectedMeeting.endDateTime instanceof Date
            ? selectedMeeting.endDateTime
            : new Date(selectedMeeting.endDateTime)}

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

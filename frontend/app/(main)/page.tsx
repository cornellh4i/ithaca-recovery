"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.scss";
import CalendarNavbar from "../components/organisms/CalendarNavbar";
import CalendarSidebar from "../components/organisms/CalendarSidebar";
import SignInPrompt from "../components/organisms/SignInPrompt";
import ViewMeetingDetails from "../components/organisms/ViewMeeting";
import EditMeetingSidebar from "../components/organisms/EditMeeting";
import DailyView from "../components/organisms/DailyView";
import WeeklyView from "../components/organisms/WeeklyView";

import { convertUTCToET } from "../../util/timeUtils";
import { IMeeting } from "../../util/models";
import { createDefaultFilters } from "../../util/meetingFilters";

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
      } catch (error) {
        console.error("Error checking authentication status:", error);
        setIsLoggedIn(false);
      }
    };

    checkAuthStatus();
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMeeting, setSelectedMeeting] = useState<IMeeting | null>(null);
  const [selectedMeetingID, setSelectedMeetingID] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<string>("Day");
  const [, setSelectedNewMeeting] = useState<boolean | null>(false);
  const [showEditMeeting, setShowEditMeeting] = useState(false);
  const [lastClickedDate, setLastClickedDate] = useState<Date | null>(null);
  // The clicked meeting box, so the View Meeting popup can anchor itself beside it.
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // Ref instead of a `selectedDate` closure/dependency so navigating the calendar while a
  // meeting is open doesn't re-trigger this fetch — we only want selectedDate's value *at
  // the moment a meeting is selected*, not to refetch whenever the date changes afterward.
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const fetchMeetingDetails = useCallback(async (meetingId: string) => {
    try {
      const response = await fetch(`/api/retrieve/meeting/${meetingId}`, { method: 'GET' });
      if (response.ok) {
        const data: IMeeting = await response.json();
        // Batched: keeps the old panel on screen until the new meeting is ready.
        setShowEditMeeting(false);
        setSelectedMeeting(data);
        // Store the date that was clicked when the meeting was selected
        setLastClickedDate(new Date(selectedDateRef.current));
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
  useEffect(() => {
    handleBack();
    setShowEditMeeting(false);
  }, [selectedView]);

  const handleOpenEdit = () => {
    setShowEditMeeting(true);
  };

  const handleCloseEdit = () => {
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
        alert("Error : Unsuccessful delete")
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Clear selected meeting state

      setSelectedMeeting(null);
      setSelectedMeetingID(null);
      setLastClickedDate(null);

       // Trigger calendar refresh
      triggerCalendarRefresh();

      alert("Meeting deleted successfully! Please check the Meeting collection on MongoDB.")

    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  // Day view defaults to all rooms visible; Week defaults to none (opt-in), since
  // showing every room at once in Week view produces too many overlapping meetings.
  const [dayFilters, setDayFilters] = useState(() => createDefaultFilters(true));
  const [weekFilters, setWeekFilters] = useState(() => createDefaultFilters(false));
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

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        {isLoggedIn === null ? null : !isLoggedIn ? (
          <SignInPrompt />
        ) : showEditMeeting && selectedMeeting ? (
            <EditMeetingSidebar
              meeting={selectedMeeting}
              onClose={handleCloseEdit}
              onUpdateSuccess={() => {
                console.log("Meeting updated!");
                triggerCalendarRefresh();
              }}
            />) : (
              <CalendarSidebar
                filters={filters}
                setFilters={setFilters}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                selectedView={selectedView}
                triggerCalendarRefresh={triggerCalendarRefresh}
              />
            )}
      </div>
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
          syncStatus={selectedMeeting.syncStatus}
          zoomSyncStatus={selectedMeeting.zoomSyncStatus}
          zoomSyncError={selectedMeeting.zoomSyncError}
          currentOccurrenceDate={lastClickedDate || undefined} // Pass the date when the meeting was clicked
          anchorEl={anchorEl}
          onBack={handleBack}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onSyncSuccess={triggerCalendarRefresh}
        />
      )}
      <div className={styles.primaryCalendar}>
        <CalendarNavbar
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onViewChange={setSelectedView}
        />
        {selectedView === "Day" ? (
          <DailyView
            filters={filters}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedMeetingID={selectedMeetingID}
            setSelectedMeetingID={setSelectedMeetingID}
            setSelectedNewMeeting={setSelectedNewMeeting}
            setAnchorEl={setAnchorEl}
            refreshTrigger={refreshTrigger}
          />
        ) : (
          <WeeklyView
            filters={filters}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedMeetingID={selectedMeetingID}
            setSelectedMeetingID={setSelectedMeetingID}
            setSelectedNewMeeting={setSelectedNewMeeting}
            setAnchorEl={setAnchorEl}
            refreshTrigger={refreshTrigger}
          />
        )}
      </div>
    </div>
  );
}

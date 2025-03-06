"use client";
import React, { useState, useEffect } from "react";
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarNavbar from "../organisms/CalendarNavbar";
import CalendarSidebar from "../organisms/CalendarSidebar";
import ViewMeetingDetails from "../organisms/ViewMeeting";
import DailyView from "../organisms/DailyView";
type MeetingDetails = {
  id: string;
  mid: string;
  title: string;
  description?: string;
  creator: string;
  group: string;
  startDateTime: Date;
  endDateTime: Date;
  zoomAccount?: string;
  zoomLink?: string;
  zid?: string;
  type: string;
  room: string;
  recurrence?: string;
};

const HomePage = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetails | null>(null);
  const [selectedMeetingID, setSelectedMeetingID] = useState<string | null>(null);
  const [selectedNewMeeting, setSelectedNewMeeting] = useState<boolean | null>(false);

  useEffect(() => {
    if (selectedMeetingID) {
      fetchMeetingDetails(selectedMeetingID);
    } else {
      setSelectedMeeting(null);
    }
  }, [selectedMeetingID]);

  const fetchMeetingDetails = async (meetingId: string) => {
    try {
      const response = await fetch(`/api/retrieve/meeting/${meetingId}`, { method: "GET" });
      if (response.ok) {
        const data: MeetingDetails = await response.json();
        setSelectedMeeting(data);
      } else {
        console.error("Failed to fetch meeting details");
      }
    } catch (error) {
      console.error("Error fetching meeting details:", error);
    }
  };

  const handleBack = () => {
    setSelectedMeeting(null);
    setSelectedMeetingID(null);
    setSelectedNewMeeting(false);
  };
  const handleEdit = () => console.log("Edit meeting");

  const handleDelete = async (mid: string) => {
    try {
      const response = await fetch("/api/delete/meeting", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mid }),
      });

      if (!response.ok) {
        alert("Error: Unsuccessful delete");
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setSelectedMeeting(null);
      alert("Meeting deleted successfully!");
    } catch (error) {
      console.error("Error deleting the meeting:", error);
    }
  };

  return (
    <div className={styles.container}>
      {/* ✅ Sidebar with MiniCalendar, Location Filters, and New Meeting Button */}
      <div className={styles.sidebar}>

        {selectedMeeting ? (
          <ViewMeetingDetails
            id={selectedMeeting.id}
            mid={selectedMeeting.mid}
            title={selectedMeeting.title}
            description={selectedMeeting.description}
            creator={selectedMeeting.creator}
            group={selectedMeeting.group}
            startDateTime={new Date(selectedMeeting.startDateTime)}
            endDateTime={new Date(selectedMeeting.endDateTime)}
            zoomAccount={selectedMeeting.zoomAccount}
            zoomLink={selectedMeeting.zoomLink}
            zid={selectedMeeting.zid}
            type={selectedMeeting.type}
            room={selectedMeeting.room}
            recurrence={selectedMeeting.recurrence}
            onBack={handleBack}
            onEdit={handleEdit}
            onDelete={() => handleDelete(selectedMeeting.mid)}
          />
        ) : (
          <CalendarSidebar selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
        )}
      </div>

      {/* ✅ Main Content (Calendar View) */}
      <div className={styles.primaryCalendar}>
        {/* ✅ Make sure Navbar is rendered only ONCE */}
        <CalendarNavbar
          selectedDate={selectedDate}
          onPreviousDay={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)))}
          onNextDay={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)))}
          onDateChange={setSelectedDate}
        />

        {/* ✅ Ensure DailyView only displays the calendar grid */}
        <DailyView 
          selectedDate={selectedDate} 
          setSelectedDate={setSelectedDate} 
          setSelectedMeetingID={setSelectedMeetingID} 
          setSelectedNewMeeting={setSelectedNewMeeting} 
        />
      </div>
    </div>
  );
};

export default HomePage;

"use client";
import React, { useState, useEffect } from "react";
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarNavbar from "../organisms/CalendarNavbar";
import CalendarSidebar from "../organisms/CalendarSidebar";
import ViewMeetingDetails from "../organisms/ViewMeeting";
import DailyView from "../organisms/DailyView";
import { convertUTCToEST } from "../../../util/timeUtils";

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
  const [inputMeetingTitleValue, setMeetingTitleValue] = useState(""); // Meeting title
  const [dateValue, setDateValue] = useState<string>(""); // Initial date value as empty
  const [timeValue, setTimeValue] = useState<string>(""); // Initial time range as empty
  const [freqValue, setFreqValue] = useState<string>("Never"); // Default frequency value
  const [inputEmailValue, setEmailValue] = useState(""); // Email input value
  const [inputDescriptionValue, setDescriptionValue] = useState(""); // Description input value

  const roomOptions = [
    "Serenity Room",
    "Seeds of Hope",
    "Unity Room",
    "Room for Improvement",
    "Small but Powerful - Right",
    "Small but Powerful - Left",
  ];

  const meetingTypeOptions = [
    "AA",
    "Al-Anon",
    "Other",
  ];

  const zoomAccountOptions = [
    "Zoom Email 1",
    "Zoom Email 2",
    "Zoom Email 3",
    "Zoom Email 4",
  ];

  const handleFileSelect = (file: File | null) => {
    if (file) {
      console.log("File selected:", file);
    } else {
      console.log("No file selected");
    }
  };

  const fetchMeetingDetails = async (meetingId: string) => {
    try {
      const response = await fetch(`/api/retrieve/meeting/${meetingId}`, { method: 'GET' });
      if (response.ok) {
        const data: MeetingDetails = await response.json(); // Ensure data matches MeetingDetails type
        setSelectedMeeting(data);
        console.log("Meeting Data:", data);
      } else {
        console.error("Failed to fetch meeting details");
      }
    } catch (error) {
      console.error('Error fetching meeting details:', error);
    }
  };

  useEffect(() => {
    if (selectedMeetingID) {
      fetchMeetingDetails(selectedMeetingID);
    } else {
      setSelectedMeeting(null);
    }
  }, [selectedMeetingID]);

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
  const handleCloseNewMeeting = () => {
    setSelectedNewMeeting(false);
  };

  const [filters, setFilters] = useState({
    SerenityRoom: true,
    SeedsofHope: true,
    UnityRoom: true,
    RoomforImprovement: true,
    SmallbutPowerfulRight: true,
    SmallbutPowerfulLeft: true,
    ZoomAccount1: true,
    ZoomAccount2: true,
    ZoomAccount3: true,
    ZoomAccount4: true,
    AA: true,
    AlAnon: true,
    Other: true,
    InPerson: true,
    Hybrid: true,
    Remote: true,
  });

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
    console.log("Converted EST to ISO:", isoDateString); // log conversion result
    return new Date(isoDateString);
  };

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        {selectedMeeting ? (
          <ViewMeetingDetails
            id={selectedMeeting.id}
            mid={selectedMeeting.mid}
            title={selectedMeeting.title}
            description={selectedMeeting.description}
            creator={selectedMeeting.creator}
            group={selectedMeeting.group}

            startDateTime={convertESTStringToDate(
              convertUTCToEST(
                selectedMeeting.startDateTime instanceof Date
                  ? selectedMeeting.startDateTime.toISOString()
                  : selectedMeeting.startDateTime
              )
            )}
            
            endDateTime={convertESTStringToDate(
              convertUTCToEST(
                selectedMeeting.endDateTime instanceof Date
                  ? selectedMeeting.endDateTime.toISOString()
                  : selectedMeeting.endDateTime
              )
            )}

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
          <CalendarSidebar 
            filters={filters}
            setFilters={setFilters}
            selectedDate={selectedDate} 
            setSelectedDate={setSelectedDate} />
        )}
      </div>
      <div className={styles.primaryCalendar}>
        <CalendarNavbar
          selectedDate={selectedDate}
          onPreviousDay={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)))}
          onNextDay={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)))}
          onToday={() => (setSelectedDate(new Date()))}
          onDateChange={setSelectedDate}
        />
        <DailyView 
          filters={filters}
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

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
  isRecurring?: boolean;
  recurrencePattern?: {
    type: string;
    interval: number;
    daysOfWeek: string[];
    startDate?: Date;
    endDate?: Date | null;
    numberOfOccurences?: number | null;
    firstDayOfWeek?: string;
  };
};


const HomePage = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetails | null>(null);
  const [selectedMeetingID, setSelectedMeetingID] = useState<string | null>(null);
  const [selectedNewMeeting, setSelectedNewMeeting] = useState<boolean| null>(false); 
  const [inputMeetingTitleValue, setMeetingTitleValue] = useState(""); // Meeting title
  const [dateValue, setDateValue] = useState<string>(""); // Initial date value as empty
  const [timeValue, setTimeValue] = useState<string>(""); // Initial time range as empty
  const [freqValue, setFreqValue] = useState<string>("Never"); // Default frequency value
  const [inputEmailValue, setEmailValue] = useState(""); // Email input value
  const [inputDescriptionValue, setDescriptionValue] = useState(""); // Description input value
  const [lastClickedDate, setLastClickedDate] = useState<Date | null>(null);
  
  const roomOptions = [
    "Serenity Room",
    "Seeds of Hope",
    "Unity Room",
    "Room for Improvement",
    "Small but Powerful - Right",
    "Small but Powerful - Left"
  ];
  const meetingTypeOptions = [
    "AA",
    "Al-Anon",
    "Other"
  ];

  const zoomAccountOptions = [
    "Zoom Email 1",
    "Zoom Email 2",
    "Zoom Email 3",
    "Zoom Email 4"
  ];

  const handleFileSelect = (file: File | null) => {
    if (file) {
      console.log("File selected:", file);
      // Handle the selected file (e.g., upload it or process it)
    } else {
      console.log("No file selected");
    }
  };

  const fetchMeetingDetails = async (meetingId: string) => {
    try {
      const response = await fetch(`/api/retrieve/meeting/${meetingId}`, { method: 'GET' });
      if (response.ok) {
        const data: MeetingDetails = await response.json();
        console.log("Meeting Data:", data);
        setSelectedMeeting(data);
        // Store the date that was clicked when the meeting was selected
        setLastClickedDate(new Date(selectedDate));
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
      setLastClickedDate(null);
    }
  }, [selectedMeetingID]);

  const handleBack = () => {
    setSelectedMeeting(null);
    setSelectedMeetingID(null);
    setSelectedNewMeeting(false);
    setLastClickedDate(null);
  };

  const handleEdit = () => console.log("Edit meeting");

  const handleDelete = async (mid: string, deleteOption?: 'this' | 'thisAndFollowing' | 'all') => {
    try {
      const payload: any = { mid };
  
      if (deleteOption) {
        payload.deleteOption = deleteOption;
      }
  
      console.log("Calling DELETE with:", payload);
  
      const response = await fetch("/api/delete/meeting", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
  
      if (!response.ok) {
        alert("Error: Unsuccessful delete");
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      setSelectedMeeting(null);
      setSelectedMeetingID(null);
      setLastClickedDate(null);
      const tempDate = new Date(selectedDate);
      setSelectedDate(new Date(tempDate.getTime() + 1));
      setTimeout(() => {
        setSelectedDate(tempDate);
      }, 100);
  
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
  const handleMeetingSelect = (meetingId: string) => {
    setSelectedMeetingID(meetingId);
    setLastClickedDate(new Date(selectedDate));
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
            startDateTime={new Date(selectedMeeting.startDateTime)}
            endDateTime={new Date(selectedMeeting.endDateTime)}
            zoomAccount={selectedMeeting.zoomAccount}
            zoomLink={selectedMeeting.zoomLink}
            zid={selectedMeeting.zid}
            type={selectedMeeting.type}
            room={selectedMeeting.room}
            recurrence={selectedMeeting.recurrence}
            isRecurring={selectedMeeting.isRecurring ?? false}
            recurrencePattern={selectedMeeting.recurrencePattern}
            currentOccurrenceDate={lastClickedDate || undefined} // Pass the date when the meeting was clicked
            onBack={handleBack}
            onEdit={handleEdit}
            onDelete={handleDelete} 
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
          setSelectedMeetingID={handleMeetingSelect}
          setSelectedNewMeeting={setSelectedNewMeeting} 
        />
      </div>
    </div>
  );
};

export default HomePage;
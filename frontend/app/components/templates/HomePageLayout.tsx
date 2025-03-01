"use client";
import React, { useContext, useState, useEffect } from 'react';
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarSidebar from "../organisms/CalendarSidebar";
import ViewMeetingDetails from "../organisms/ViewMeeting";

import DailyView from "../organisms/DailyView/index";

// Define the type for selectedMeeting to match ViewMeetingDetailsProps
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
  // Define selectedMeeting state with MeetingDetails type or null
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetails | null>(null);
  const [selectedMeetingID, setSelectedMeetingID] = useState<string | null>(null);
  const [selectedNewMeeting, setSelectedNewMeeting] = useState<boolean| null>(false); 
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

  const handleCloseNewMeeting = () => {
    setSelectedNewMeeting(false);
  };

  const handleEdit = () => console.log("Edit meeting");
  const handleDelete = async (mid : string) => {
    try {
      const response = await fetch('/api/delete/meeting', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          mid 
        }),
      });
      console.log("checking if response is ok")
      if (!response.ok) {
        alert("Error : Unsuccesful delete")
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log("setting usestate to null 1")
      setSelectedMeeting(null);
      console.log("setting usestate to null 2")

      const meetingResponse = await response.json();
      console.log(meetingResponse);
      alert("Meeting deleted successfully! Please check the Meeting collection on MongoDB.")
    
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
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

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <CalendarSidebar 
          filters={filters}
          setFilters={setFilters}/>
      </div>
      <div className={styles.primaryCalendar}>
        {/* Pass setSelectedMeetingID to DailyView for interaction */}
        <DailyView 
          setSelectedMeetingID={setSelectedMeetingID} 
          setSelectedNewMeeting={setSelectedNewMeeting} 
          filters={filters} />
      </div>
    </div>
  );
};

export default HomePage;
"use client";
import React, { useContext, useState } from 'react';
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarSidebar from "../organisms/CalendarSidebar";
import DailyView from "../organisms/DailyView/index";

const HomePage = () => {
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null); // Track selected meeting or null
  
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
  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <CalendarSidebar />
      </div>
      <div className={styles.primaryCalendar}>
        <DailyView />
      </div>
    </div>
  );
};

export default HomePage;
"use client";
import React, { useContext, useState } from 'react';
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarSidebar from "../organisms/CalendarSidebar";
import DailyView from "../organisms/DailyView/index";
import ViewMeetingDetails from '../../components/organisms/ViewMeeting';

const HomePage = () => {
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null); // Track selected meeting or null
  const [deleteError, setDeleteError] = useState<string | null>(null); // Error state for delete operation
  
  const handleDelete = () => {
    setSelectedMeeting(null); // Hide ViewMeeting and show CalendarSidebar
  };

  const handleDeleteError = (errorMessage: string) => {
    setDeleteError(errorMessage); // Set the error message to display in the popup
  };

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <CalendarSidebar />
      </div>
      <div className={styles.primaryCalendar}>
        {/* Render ViewMeeting if a meeting is selected, else show default view */}
        {selectedMeeting ? (
          <ViewMeetingDetails
            id={selectedMeeting}
            mid={selectedMeeting}
            title="Meeting Title"
            description="Meeting Description"
            creator="Creator Name"
            group="Group Name"
            startDateTime={new Date()}
            endDateTime={new Date()}
            zoomAccount="Zoom Account"
            zoomLink="https://zoom.us"
            zid="zoomId"
            type="Meeting Type"
            room="Room"
            onBack={() => setSelectedMeeting(null)} // Handle going back
            onEdit={() => console.log('Edit clicked')}
            onDelete={handleDelete} // Pass the handleDelete function here
            // deleteError={deleteError} // Pass the error message to ViewMeeting
            // setDeleteError={handleDeleteError} // Pass the function to handle error state
          
          />
        ) : (
          <DailyView />

        )}
        
      </div>
    </div>
  );
};

export default HomePage;

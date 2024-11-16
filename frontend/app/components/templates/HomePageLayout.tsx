"use client";
import React, { useState } from 'react';
import styles from "../../../styles/HomePageLayout.module.scss";
import CalendarSidebar from "../organisms/CalendarSidebar";
import ViewMeetingDetails from "../organisms/ViewMeeting";
import BoxText from "../atoms/BoxText/"
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
  const handleBack = () => setSelectedMeeting(null);
  const handleEdit = () => console.log("Edit meeting");
  const handleDelete = () => console.log("Delete meeting");
  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <CalendarSidebar />
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
            onDelete={handleDelete}
          />
        ) : (
          <div>Nothing to see here</div>
        )}
      </div>
      <div className={styles.primaryCalendar}>Primary Calendar</div>
      <BoxText
        boxType="Room Block"
        title="Serenity Room"
        primaryColor="#B3EA75"
        meetingId="2024-04-29T21:02:26.722Z"
        onClick={(meetingId) => fetchMeetingDetails(meetingId)}
      />
      <BoxText
        boxType="Meeting Block"
        title="Meeting Name"
        primaryColor="#D2AFFF"
        time="9am-10am"
        tags={['Hybrid', 'AA']}
        meetingId="2024-04-29T21:01:39.214Z"
        onClick={(meetingId) => fetchMeetingDetails(meetingId)}
      />
    </div>
  );
};
export default HomePage;
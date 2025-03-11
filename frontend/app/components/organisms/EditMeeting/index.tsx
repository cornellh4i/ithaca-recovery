import React, { useState } from "react";
import styles from "../../../../styles/components/organisms/EditMeeting.module.scss";
import TextField from "../../atoms/TextField";
import DatePicker from "../../atoms/DatePicker";
import TimePicker from "../../atoms/TimePicker";
import Dropdown from "../../atoms/dropdown";
import UploadPandaDocs from "../../atoms/upload";
import RecurringMeetingForm from "../../molecules/RecurringMeeting";
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import GroupIcon from '@mui/icons-material/Group';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';

// Interface for the meeting data structure
interface Meeting {
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
  format: string;
  room: string;
}

interface EditMeetingProps {
  /** The existing meeting data to edit. */
  meeting: Meeting;
  /** Called when the user wants to close the sidebar (when X button is clicked). */
  onClose: () => void;
  /** Called after a successful update */
  onUpdateSuccess?: () => void;
}

const EditMeeting: React.FC<EditMeetingProps> = ({ meeting, onClose, onUpdateSuccess }) => {
  // Helper function to format time as HH:MM
  const formatTime = (date: Date) => {
    const hours = new Date(date).getHours().toString().padStart(2, '0');
    const minutes = new Date(date).getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Initialize form state with existing meeting data
  const [formData, setFormData] = useState({
    title: meeting.title,
    description: meeting.description || '',
    creator: meeting.creator,
    date: new Date(meeting.startDateTime).toISOString().split('T')[0],
    startTime: formatTime(meeting.startDateTime),
    endTime: formatTime(meeting.endDateTime),
    zoomAccount: meeting.zoomAccount || '',
    type: meeting.type || 'AA',
    format: meeting.format || 'In-person',
    room: meeting.room,
    isRecurring: false
  });

  // Available options for dropdowns
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
    "Others"
  ];

  const zoomAccountOptions = [
    "Zoom Email 1",
    "Zoom Email 2",
    "Zoom Email 3",
    "Zoom Email 4"
  ];

  // Handle form submission and meeting update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Create dates in local timezone
      const startDateTime = new Date(`${formData.date}T${formData.startTime}:00`);
      const endDateTime = new Date(`${formData.date}T${formData.endTime}:00`);

      // Convert to UTC for storage
      const startDateTimeUTC = new Date(startDateTime.getTime() - (startDateTime.getTimezoneOffset() * 60000));
      const endDateTimeUTC = new Date(endDateTime.getTime() - (endDateTime.getTimezoneOffset() * 60000));

      // Prepare update payload
      const updatePayload = {
        id: meeting.id,
        mid: meeting.mid,
        title: formData.title,
        description: formData.description,
        creator: formData.creator,
        group: meeting.group,
        startDateTime: startDateTimeUTC.toISOString(),
        endDateTime: endDateTimeUTC.toISOString(),
        zoomAccount: formData.zoomAccount,
        zoomLink: meeting.zoomLink,
        zid: meeting.zid,
        type: formData.type,
        format: formData.format,
        room: formData.room
      };

      // Send update request
      const response = await fetch('/api/update/meeting', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Meeting not found. It may have been deleted.');
        }
        throw new Error('Failed to update meeting');
      }

      alert('Meeting updated successfully!');
      onUpdateSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error updating meeting:', error);
      alert(`Failed to update meeting: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      console.log("File selected:", file);
    }
  };

  return (
    <div className={styles.editMeetingSidebar} onClick={(e) => e.stopPropagation()}>
      {/* Header section */}
      <div className={styles.header}>
        <h1>Edit Meeting</h1>
        <button className={styles.closeButton} onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}>
          <CloseIcon />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Meeting title input */}
        <div className={styles.dummyComponent}>
          <TextField
            input="Meeting title"
            value={formData.title}
            onChange={(value) => setFormData(prev => ({ ...prev, title: value }))}
          />
        </div>

        {/* Meeting format selection buttons */}
        <div className={styles.meetingButtons} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`${styles.button} ${formData.format === 'In-person' ? styles.buttonActive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setFormData(prev => ({ ...prev, format: 'In-person' }));
            }}
          >
            In-person
          </button>
          <button
            type="button"
            className={`${styles.button} ${formData.format === 'Hybrid' ? styles.buttonActive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setFormData(prev => ({ ...prev, format: 'Hybrid' }));
            }}
          >
            Hybrid
          </button>
          <button
            type="button"
            className={`${styles.button} ${formData.format === 'Remote' ? styles.buttonActive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setFormData(prev => ({ ...prev, format: 'Remote' }));
            }}
          >
            Remote
          </button>
        </div>

        {/* Date and time selection */}
        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <DatePicker
            label={<CalendarTodayIcon />}
            value={formData.date}
            onChange={(value) => setFormData(prev => ({ ...prev, date: value }))}
          />
        </div>

        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <TimePicker
            label={<AccessTimeIcon />}
            value={`${formData.startTime} - ${formData.endTime}`}
            onChange={(value) => {
              const [start, end] = value.split(' - ');
              setFormData(prev => ({
                ...prev,
                startTime: start,
                endTime: end
              }));
            }}
            disablePast={true}
          />
        </div>

        {/* Recurring meeting options */}
        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <RecurringMeetingForm />
        </div>

        {/* Room, meeting type, and zoom account dropdowns */}
        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <Dropdown
            label={<LocationOnIcon />}
            isVisible={true}
            elements={roomOptions}
            name="Select Room"
            selectedValue={formData.room}
            onChange={(value) => setFormData(prev => ({ ...prev, room: value }))}
          />
        </div>

        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <Dropdown
            label={<GroupIcon />}
            isVisible={true}
            elements={meetingTypeOptions}
            name="Select Meeting Type"
            selectedValue={formData.type}
            onChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
          />
        </div>

        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <Dropdown
            label={<PersonIcon />}
            isVisible={true}
            elements={zoomAccountOptions}
            name="Select Zoom Account"
            selectedValue={formData.zoomAccount}
            onChange={(value) => setFormData(prev => ({ ...prev, zoomAccount: value }))}
          />
        </div>

        {/* Email and additional details */}
        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <TextField
            input="Email"
            label={<EmailIcon />}
            value={formData.creator}
            onChange={(value) => setFormData(prev => ({ ...prev, creator: value }))}
          />
        </div>

        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <UploadPandaDocs onFileSelect={handleFileSelect} />
        </div>

        <div className={styles.dummyComponent} onClick={(e) => e.stopPropagation()}>
          <TextField
            input="Description"
            value={formData.description}
            onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
          />
        </div>

        {/* Action buttons */}
        <div className={styles.buttonGroup} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.createMeetingButton}
            onClick={(e) => e.stopPropagation()}
          >
            Update Meeting
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditMeeting;

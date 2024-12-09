import React, { useState } from 'react';
import styles from "../../../../styles/components/organisms/EditMeeting.module.scss";
import TextField from '../../atoms/TextField';
import DatePicker from '../../atoms/DatePicker';
import TimePicker from '../../atoms/TimePicker';
import RecurringMeetingForm from '../../molecules/RecurringMeeting';
import Dropdown from '../../atoms/dropdown';
import UploadPandaDocs from '../../atoms/upload';
import VideoCameraFrontIcon from '@mui/icons-material/VideoCameraFront';
import { v4 as uuidv4 } from 'uuid';
import { IMeeting } from '../../../../util/models';

interface EditMeetingProps {
  id: string;
  mid: string;
  title: string;
  description: string; 
  creator: string;
  group: string; 
  startDateTime: Date;
  endDateTime: Date;
  zoomAccount: string;
  zoomLink?: string;
  zid?: string;
  type: string;
  room: string;
  recurrence?: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

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

const NewMeetingSidebar: React.FC<EditMeetingProps> = ({
  id,
  mid,
  title,
  description,
  creator,
  group,
  startDateTime,
  endDateTime,
  zoomAccount,
  zoomLink,
  zid,
  type,
  room,
  recurrence,
  onBack,
  onEdit,
  onDelete,
}) => {
    const handleRoomChange = (value: string) => setSelectedRoom(value);
    const handleMeetingTypeChange = (value: string) => setSelectedMeetingType(value);
    const handleZoomAccountChange = (value: string) => setSelectedZoomAccount(value);

    const handleFileSelect = (file: File | null) => {
        if (file) {
        console.log("File selected:", file);
        } else {
        console.log("No file selected");
        }
    };

    function convertToISODate(dateString: string) {
      const dateObject = new Date(dateString);
      if (isNaN(dateObject.getTime())) {
        console.error("Invalid date string:", dateString)
        return null;
      }
      return dateObject.toISOString().split('T')[0]; // Returns "YYYY-MM-DD"
    }

    const generateMeetingId = () => {
      return uuidv4();
    };

    const updateMeeting = async () => {
      try {

        const isoDateValue = convertToISODate(dateValue);

        if (!isoDateValue) {
          console.error("Failed to convert dateValue to ISO format");
          return;
        }

        const [startTime, endTime] = timeValue?.split(' - ') || [];
        if (!startTime || !endTime) {
          console.error("Invalid timeValue format");
          return;
        }

        const startDateString = `${isoDateValue}T${startTime}`;
        const endDateString = `${isoDateValue}T${endTime}`;

        if (!startDateString || !endDateString) {
          console.error("Start or end date string could not be constructed");
          return;
        }

        const startDateTime = new Date(startDateString);
        const endDateTime = new Date(endDateString);
        
        startDateTime.setHours(startDateTime.getHours() - 5);
        endDateTime.setHours(endDateTime.getHours() - 5);

        const updatedMeeting: IMeeting = {
          title: inputMeetingTitleValue || title,
          mid: mid, 
          description: inputDescriptionValue || description,
          creator: creator,
          group: group,
          startDateTime: startDateTime,
          endDateTime: endDateTime,
          zoomAccount: selectedZoomAccount,
          type: selectedMeetingType,
          room: selectedRoom,
        };

        const response = await fetch(`/api/write/meeting`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedMeeting),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const meetingResponse = await response.json();
        console.log("Meeting updated successfully:", meetingResponse);
        alert("Meeting updated successfully!");
      } catch (error) {
        console.error('Error updating the meeting:', error);
        alert("Failed to update the meeting. Please try again.");
      }
    }

    const [inputMeetingTitleValue, setMeetingTitleValue] = useState(""); 
    const [dateValue, setDateValue] = useState<string>(String(startDateTime.toLocaleDateString("en-US"))); 
    const [timeValue, setTimeValue] = useState<string>(String(startDateTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })));
    const [freqValue, setFreqValue] = useState<string>("Never");
    const [inputEmailValue, setEmailValue] = useState("");
    const [inputDescriptionValue, setDescriptionValue] = useState(""); // Description input value
    const [selectedRoom, setSelectedRoom] = useState<string>("Serenity Room");
    const [selectedMeetingType, setSelectedMeetingType] = useState<string>(group);
    const [selectedMeetingMode, setSelectedMeetingMode] = useState<string>(type);
    const [selectedZoomAccount, setSelectedZoomAccount] = useState<string>("Zoom Email 1");

  return (
    <div className={styles.newMeetingSidebar}>
      <div className={styles.dummyComponent}>
        <TextField
            input={title}
            value={inputMeetingTitleValue}
            onChange={setMeetingTitleValue}
        />
      </div>
      <div className={styles.meetingButtons}>
        <button
          className={`${styles.button}`}
          onClick={() => setSelectedMeetingMode('Hybrid')}
          style={selectedMeetingMode === 'Hybrid' ? { background: '#F1F1F1', borderRadius: '8px' } : {}}
        >
          Hybrid
        </button>
        <button
          className={`${styles.button}`}
          onClick={() => setSelectedMeetingMode('In Person')}
          style={selectedMeetingMode === 'In Person' ? { background: '#F1F1F1', borderRadius: '8px' } : {}}
        >
          In Person
        </button>
        <button
          className={`${styles.button}`}
          onClick={() => setSelectedMeetingMode('Remote')}
          style={selectedMeetingMode === 'Remote' ? { background: '#F1F1F1', borderRadius: '8px' } : {}}
        >
          Remote
        </button>
      </div>
      <div className={styles.dummyComponent}>
        <DatePicker
            label={<img src='/svg/calendar-icon.svg' alt="Calendar Icon" />}
            value={dateValue}
            onChange={setDateValue}
            error={dateValue === '' ? 'Date is required' : undefined}
        />
      </div>
      <div className={styles.dummyComponent}>
        <TimePicker
            label={<img src='/svg/clock-icon.svg' alt="Clock Icon" />}
            value={timeValue}
            onChange={setTimeValue}
            disablePast={true}
            error={timeValue === '' ? 'Time is required' : undefined}
        />
      </div>
      <div className={styles.dummyComponent}>
        <RecurringMeetingForm/>
      </div>
      <div className={styles.dummyComponent}>
        <Dropdown
            label={<img src="/svg/location-icon.svg" alt="Location Icon" />}
            isVisible={true}
            elements={roomOptions}
            name="Select Room"
            onChange={handleRoomChange}
        />
      </div>
      <div className={styles.dummyComponent}>
        <Dropdown
            label={<img src="svg/group-icon.svg" alt="Group Icon"/>}
            isVisible={true}
            elements={meetingTypeOptions}
            name={group}
            onChange={handleMeetingTypeChange}
        />
      </div>
      <div className={styles.dummyComponent}>
        <Dropdown
            label={<img src="svg/person-icon.svg" alt="Person Icon"/>}
            isVisible={true}
            elements={zoomAccountOptions}
            name={zoomAccount} 
            onChange={handleZoomAccountChange}
        />
      </div>
      <div className={styles.dummyComponent}>
        {zoomLink && <a href={zoomLink} target="_blank" rel="noopener noreferrer" className={styles.zoomLink}>
        <VideoCameraFrontIcon /> {zoomLink}
        </a>}
      </div>
      <div className={styles.dummyComponent}>
        <UploadPandaDocs onFileSelect={handleFileSelect} />
      </div>
      <div className={styles.dummyComponent}>
        <TextField
            input={description}
            label = ""
            value={inputDescriptionValue}
            onChange={setDescriptionValue}
        />
      </div>
      <div className={styles.buttonGroup}>
        <button className={styles.cancelButton}>Cancel</button>
        <button className={styles.saveButton} onClick={updateMeeting}>Save Changes</button>
      </div>
    </div>
)};

export default NewMeetingSidebar;
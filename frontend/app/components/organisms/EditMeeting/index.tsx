import React, { useState } from 'react';
import styles from "../../../../styles/components/organisms/EditMeeting.module.scss";
import TextField from '../../atoms/TextField';
import DatePicker from '../../atoms/DatePicker';
import TimePicker from '../../atoms/TimePicker';
import RecurringMeetingForm from '../../molecules/RecurringMeeting';
import Dropdown from '../../atoms/dropdown';
import UploadPandaDocs from '../../atoms/upload';
import VideoCameraFrontIcon from '@mui/icons-material/VideoCameraFront';

interface EditMeetingProps {
  id: string;
  mid: string;
  title: string;
  description?: string; 
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
      <button className={styles.createMeetingButton}>Create Meeting</button>
    </div>
)};

export default NewMeetingSidebar;
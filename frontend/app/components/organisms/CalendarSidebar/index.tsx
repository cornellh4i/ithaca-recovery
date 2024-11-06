import React, { useState } from 'react';
import TextButton from '../../atoms/textbutton';
import TextField from '../../atoms/TextField';
import DatePicker from '../../atoms/DatePicker';
import TimePicker from '../../atoms/TimePicker';
import RadioGroup from '../../atoms/RadioGroup';
import Dropdown from '../../atoms/dropdown';
import UploadPandaDocs from '../../atoms/upload';
import MeetingsFilter from '../../molecules/MeetingsFilter';
import NewMeetingSidebar from '../NewMeeting';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import styles from '../../../../styles/components/organisms/CalendarSidebar.module.scss';

const CalendarSidebar: React.FC = () => {
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(''); // Default to an empty string

  const handleOpenNewMeeting = () => {
    setIsNewMeetingOpen(true);
  };

  const handleCloseNewMeeting = () => {
    setIsNewMeetingOpen(false);
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      console.log("File selected:", file);
      // Handle the selected file (e.g., upload it or process it)
    } else {
      console.log("No file selected");
    }
  };

  return (
    <div className={styles.calendarSidebar}>
      {isNewMeetingOpen ? (
        <div>
          {isNewMeetingOpen && (
            <div className={styles.newMeetingHeader}>
              <h3>New Meeting</h3>
              <IconButton onClick={handleCloseNewMeeting}><CloseIcon /></IconButton>
            </div>
          )}
          <NewMeetingSidebar //Placeholder
            meetingTitleTextField={<TextField label="Meeting Title" onChange={() => { }} />}
            DatePicker={<DatePicker label="Select Date" onChange={() => { }} />}
            TimePicker={<TimePicker label="Select Time" onChange={() => { }} />}
            RadioGroup={
              <RadioGroup
                label="Select Option"
                options={["Option 1", "Option 2", "Option 3"]}
                selectedOption={selectedOption}
                onChange={setSelectedOption}
                name="preferences"
                disabledOptions={[]}
              />
            }
            roomSelectionDropdown={<Dropdown label="Room Selection" isVisible={false} elements={['Option 1', 'Option 2', 'Option 3']} name={"roomSelection"} />}
            meetingTypeDropdown={<Dropdown label="Meeting Type" isVisible={false} elements={['Option 1', 'Option 2', 'Option 3']} name={"meetingType"} />}
            zoomAccountDropdown={<Dropdown label="Zoom Account" isVisible={false} elements={['Option 1', 'Option 2', 'Option 3']} name={"zoomAccount"} />}
            emailTextField={<TextField label="Email" onChange={() => { }} />}
            uploadPandaDocsForm={<UploadPandaDocs onFileSelect={handleFileSelect} />}
          />
        </div>
      ) : (
        <>
          <TextButton label="New Meeting" onClick={handleOpenNewMeeting} icon={<AddIcon />} />
          <div className={styles.meetingsFilter}>
            <MeetingsFilter />
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarSidebar;


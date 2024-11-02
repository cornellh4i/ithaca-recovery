import React, { useState } from 'react';
import TextButton from '../../atoms/textbutton';
import TextField from '../../atoms/TextField';
import DatePicker from '../../atoms/DatePicker';
import TimePicker from '../../atoms/TimePicker';
import RadioGroup from '../../atoms/RadioGroup';
import MeetingsFilter from '../../molecules/MeetingsFilter';
import NewMeetingSidebar from '../NewMeeting';
import AddIcon from '@mui/icons-material/Add';
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

  return (
    <div className={styles.calendarSidebar}>
      {isNewMeetingOpen ? (
        <NewMeetingSidebar //Placeholder
          TextField={<TextField label="Meeting Title" onChange={() => { }} />}
          DatePicker={<DatePicker label="Select Date" />}
          TimePicker={<TimePicker label="Select Time" />}
          RadioGroup={
            <RadioGroup
              label="Select Option"
              options={["", "", ""]}
              selectedOption={selectedOption}
              onChange={setSelectedOption}
              name="preferences"
              disabledOptions={[]}
            />
          }
        />
      ) : (
        <>
          <TextButton label="New Meeting" onClick={handleOpenNewMeeting} icon={<AddIcon />} />
          <div className={styles.meetingsFilter}>
            <MeetingsFilter />
          </div>
        </>
      )}
      {/* Close button, if needed */}
      {isNewMeetingOpen && (
        <button onClick={handleCloseNewMeeting}>Close</button> // Simple close button
      )}
    </div>
  );
};

export default CalendarSidebar;


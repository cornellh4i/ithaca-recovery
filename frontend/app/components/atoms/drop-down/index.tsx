import React, { useState } from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  isVisible: boolean;
}

const locations = [
  "Serenity Room",
  "Seeds of Hope",
  "Unity Room",
  "Room for Improvement",
  "Small but Powerful - Right",
  "Small but Powerful - Left",
];

const meetings = [
  "AA",
  "Al-Anon",
  "Other"
];

const accounts = [
  "Zoom Account 1",
  "Zoom Account 2",
  "Zoom Account 3"
];

const Dropdown: React.FC<DropdownProps> = ({ isVisible }) => {
  const [selectedMeetingType, setSelectedMeetingType] = useState<string>("Hybrid");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null); // Stores the selected location
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null); // Stores the selected meeting
  const [selectedZoom, setSelectedZoom] = useState<string | null>(null); // Stores the selected Zoom account

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null); // Track which dropdown is open

  if (!isVisible) return null;

  const handleDropdownToggle = (dropdownType: string) => {
    setActiveDropdown((prev) => (prev === dropdownType ? null : dropdownType));
  };

  const handleLocationClick = (location: string) => {
    setSelectedLocation(location);
    setActiveDropdown(null); // Close dropdown after selection
  };

  const handleMeetingClick = (meeting: string) => {
    setSelectedMeeting(meeting);
    setActiveDropdown(null); // Close dropdown after selection
  };

  const handleZoomClick = (Zoom: string) => {
    setSelectedZoom(Zoom);
    setActiveDropdown(null); // Close dropdown after selection
  };

  const handleMeetingTypeClick = (type: string) => {
    setSelectedMeetingType(type);
  };

  return (
    <div className={styles.dropdown}>
      <input
        id="meetingTitle"
        type="text"
        className={styles.meetingTitleInput}
        placeholder="Meeting title"
      />

      <div className={styles.meetingTypeContainer}>
        <button
          className={`${styles.meetingTypeButton} ${selectedMeetingType === "Hybrid" ? styles.active : ""}`}
          onClick={() => handleMeetingTypeClick("Hybrid")}
        >
          Hybrid
        </button>
        <button
          className={`${styles.meetingTypeButton} ${selectedMeetingType === "In Person" ? styles.active : ""}`}
          onClick={() => handleMeetingTypeClick("In Person")}
        >
          In Person
        </button>
        <button
          className={`${styles.meetingTypeButton} ${selectedMeetingType === "Remote" ? styles.active : ""}`}
          onClick={() => handleMeetingTypeClick("Remote")}
        >
          Remote
        </button>
      </div>

      {/* Location Dropdown */}
      <div className={styles.DropdownContainer}>
        <button
          className={`${styles.DropdownButton} ${activeDropdown === "location" ? styles.activeDropdown : ''}`}
          onClick={() => handleDropdownToggle("location")}
        >
          {selectedLocation ? selectedLocation : "Location"}
        </button>
        {activeDropdown === "location" && (
          <ul className={styles.locationList}>
            {locations.map((location, index) => (
              <li
                key={index}
                className={`${styles.dropdownItem} ${selectedLocation === location ? styles.selected : ''}`}
                onClick={() => handleLocationClick(location)}
              >
                {location}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Meeting Dropdown */}
      <div className={styles.DropdownContainer}>
        <button
          className={`${styles.DropdownButton} ${activeDropdown === "meeting" ? styles.activeDropdown : ''}`}
          onClick={() => handleDropdownToggle("meeting")}
        >
          {selectedMeeting ? selectedMeeting : "Meeting Type"}
        </button>
        {activeDropdown === "meeting" && (
          <ul className={styles.locationList}>
            {meetings.map((meeting, index) => (
              <li
                key={index}
                className={`${styles.dropdownItem} ${selectedMeeting === meeting ? styles.selected : ''}`}
                onClick={() => handleMeetingClick(meeting)}
              >
                {meeting}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Zoom Account Dropdown */}
      <div className={styles.DropdownContainer}>
        <button
          className={`${styles.DropdownButton} ${activeDropdown === "zoom" ? styles.activeDropdown : ''}`}
          onClick={() => handleDropdownToggle("zoom")}
        >
          {selectedZoom ? selectedZoom : "Zoom Account"}
        </button>
        {activeDropdown === "zoom" && (
          <ul className={styles.locationList}>
            {accounts.map((Zoom, index) => (
              <li
                key={index}
                className={`${styles.dropdownItem} ${selectedZoom === Zoom ? styles.selected : ''}`}
                onClick={() => handleZoomClick(Zoom)}
              >
                {Zoom}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Dropdown;

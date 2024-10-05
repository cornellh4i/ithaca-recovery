import React, { useState } from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectLocation: (location: string) => void;
}

const locations = [
  "Conference Room A",
  "Conference Room B",
  "Cafeteria",
  "Zoom",
  "Office 101",
  "Outdoor Patio",
];

const Dropdown: React.FC<DropdownProps> = ({ isVisible, onClose, onSelectLocation }) => {
  const [selectedMeetingType, setSelectedMeetingType] = useState<string>("Hybrid");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false); // For controlling location dropdown
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null); // Stores the selected location

  if (!isVisible) return null;

  const handleLocationClick = (location: string) => {
    setSelectedLocation(location);
    onSelectLocation(location);
    setShowLocationDropdown(false); // Close the dropdown when a location is selected
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
      <div className={styles.locationDropdownContainer}>
        <button
          className={styles.locationDropdownButton}
          onClick={() => setShowLocationDropdown((prev) => !prev)} // Toggle dropdown
        >
          {selectedLocation ? selectedLocation : "Location"}
        </button>
        {showLocationDropdown && (
          <ul className={styles.locationList}>
            {locations.map((location, index) => (
              <li
                key={index}
                className={styles.dropdownItem}
                onClick={() => handleLocationClick(location)}
              >
                {location}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Dropdown;

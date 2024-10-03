import React from "react";
import styles from "../../../../styles/Dropdown.module.scss";

interface DropdownProps {
  isVisible: boolean; // Determines if the dropdown is visible
//   onClose: () => void; // Function to close the dropdown
onClose: () => void;    
onSelectLocation: (location: string) => void; // Function to handle location selection
}


// Predefined meeting locations
const locations = [
    "Conference Room A",
    "Conference Room B",
    "Cafeteria",
    "Zoom",
    "Office 101",
    "Outdoor Patio",
  ];
  
const Dropdown: React.FC<DropdownProps> = ({ isVisible, onClose, onSelectLocation  }) => {
    if (!isVisible) return null;  // Don't render if not visible

    const handleLocationClick = (location: string) => {
        onSelectLocation(location); // Call the function to handle selection
        onClose(); // Close the dropdown
      
    };

    return (
        <div className={styles.dropdown}>

            <label htmlFor="meetingTitle">Meeting Title</label>
            <input
              id="meetingTitle"
              type="text"
              className={styles.dropdown}
              placeholder="Enter meeting title..."
            />


        <ul className={styles.locationList}>
        {locations.map((location, index) => (
          <li
            key={index}
            className={styles.dropdownItem}
            onClick={() => handleLocationClick(location)}  // Handle click event
          >
            {location}
          </li>
        ))}
      </ul>
        </div>
    );
};

export default Dropdown;

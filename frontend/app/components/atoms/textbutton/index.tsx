import React from "react";
import styles from "../../../../styles/TextButton.module.scss";

interface ButtonProps {
    label: string;              // Text to display inside the button
    onClick: () => void;        // Function to call when button is clicked
    icon?: React.ReactNode;	// icon to be displayed within the button
  }


const TextButton: React.FC<ButtonProps> = ({ onClick, label, icon}) => {
    const handleClick = async () => {
        await onClick();
    }
  
    return (
        <button className={styles.btn} onClick={handleClick}>
            {icon && <span className={styles.icon}>{icon}</span>}
            {label && <span className={styles.label}>{label}</span>}
            </button>
      )
};

export default TextButton;
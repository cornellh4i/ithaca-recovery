import React from 'react';
import styles from '../../../../styles/components/atoms/SolidButton.module.scss';

interface SolidButtonProps {
  text: string;
  bgColor: string;
  onClick: () => void;
}

const SolidButton: React.FC<SolidButtonProps> = ({ text, bgColor, onClick }) => {
  return (
    <button
      className={styles.solidbutton}
      style={{ backgroundColor: bgColor }}
      onClick={onClick}
    >
      {text}
    </button>
  );
};

export default SolidButton;

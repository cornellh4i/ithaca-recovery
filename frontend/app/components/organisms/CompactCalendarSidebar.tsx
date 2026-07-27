import React from 'react';
import IconButton from '../atoms/IconButton';
import { useSidebar } from '../../context/SidebarContext';
import styles from '../../../styles/components/organisms/CompactCalendarSidebar.module.scss';

const CompactCalendarSidebar: React.FC = () => {
  const { expandSidebar } = useSidebar();

  return (
    <div>
      <div className={styles.expandButtonWrapper}>
        <IconButton
          icon={<img src="/svg/chevron-right-icon.svg" alt="" />}
          ariaLabel="Show calendar sidebar"
          tooltip="Show calendar sidebar"
          size="compact"
          onClick={expandSidebar}
        />
      </div>
    </div>
  );
};

export default CompactCalendarSidebar;

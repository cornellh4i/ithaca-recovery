import React from "react";
import IconButton from "../atoms/IconButton";
import styles from "../../../styles/components/calendar/MobileFab.module.scss";

interface MobileFabProps {
  onClick: () => void;
}

// Pinned bottom-right, rendered as a page-level sibling outside MobileCalendarView's swipe
// region (see MobileCalendarView.tsx's DayColumn drag wrapper) so the drag gesture never
// swallows a tap intended for this button.
const MobileFab: React.FC<MobileFabProps> = ({ onClick }) => {
  return (
    <div className={styles.fabWrapper}>
      <IconButton
        icon={<img src="/svg/plus-icon-white.svg" alt="" />}
        ariaLabel="New meeting"
        variant="filled"
        backgroundColor="#CC3366" // $brand-pink-color -- IconButton takes a literal color, can't reference the SCSS var directly (same manual-sync convention as CompactCalendarSidebar's matching FAB)
        onClick={onClick}
      />
    </div>
  );
};

export default MobileFab;

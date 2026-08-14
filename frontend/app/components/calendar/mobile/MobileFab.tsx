import React from "react";
import IconButton from "../../ui/buttons/IconButton";
import styles from "../../../../styles/components/calendar/mobile/MobileFab.module.scss";

interface MobileFabProps {
  onClick: () => void;
}

// Pinned bottom-right, rendered as a page-level sibling outside DayPortraitView's swipe
// region (see DayPortraitView.tsx's DayColumn drag wrapper) so the drag gesture never
// swallows a tap intended for this button.
const MobileFab: React.FC<MobileFabProps> = ({ onClick }) => {
  return (
    <div className={styles.fabWrapper}>
      <IconButton
        name="plus"
        ariaLabel="New meeting"
        variant="filled"
        backgroundColor="#CC3366" // $brand-pink-color -- IconButton takes a literal color, can't reference the SCSS var directly (same manual-sync convention as CompactCalendarSidebar's matching FAB)
        onClick={onClick}
      />
    </div>
  );
};

export default MobileFab;

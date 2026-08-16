"use client";

import React from "react";
import MobileFullScreenSheet from "../ui/overlays/MobileFullScreenSheet";
import LoginCard from "./LoginCard";
import IconButton from "../ui/buttons/IconButton";
import styles from "./MobileLoginSheet.module.scss";

interface MobileLoginSheetProps {
  isOpen: boolean;
  onBack: () => void;
}

// Slides in from the right over the calendar when the signed-out profile button is tapped
// (see MobileAppNavigation.tsx) -- purely a local state toggle, never a real navigation to
// /login, so "back" just slides this back out and the calendar underneath is exactly as the
// user left it (nothing unmounted/refetched). onSwipeDismiss lets a rightward swipe (the same
// direction this sheet slides back out to) trigger that same "back" path as the arrow button.
const MobileLoginSheet: React.FC<MobileLoginSheetProps> = ({ isOpen, onBack }) => (
  <MobileFullScreenSheet isOpen={isOpen} slideFrom="right" onSwipeDismiss={onBack} onClose={onBack} ariaLabel="Sign in">
    <div className={styles.header}>
      <IconButton name="back-arrow" ariaLabel="Back to calendar" variant="ghost" onClick={onBack} />
    </div>
    <div className={styles.content}>
      <LoginCard />
    </div>
  </MobileFullScreenSheet>
);

export default MobileLoginSheet;

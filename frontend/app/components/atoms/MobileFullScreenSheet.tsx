"use client";

import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import styles from "../../../styles/components/atoms/MobileFullScreenSheet.module.scss";

interface MobileFullScreenSheetProps {
  isOpen: boolean;
  children: React.ReactNode;
  // "bottom" (default) for New/Edit Meeting; "right" for the profile-icon -> login slide-in
  // (MobileLoginSheet), which per spec slides in from the right instead of sliding up.
  slideFrom?: "bottom" | "right";
}

// Full-screen slide wrapper for New/Edit Meeting and the mobile login sheet -- a simple,
// standard conditional-render-inside-AnimatePresence (not a repeatedly-key-swapped child),
// which is the case AnimatePresence's exit/unmount actually handles reliably (see
// WeekStrip.tsx's comment for the pattern that doesn't).
const MobileFullScreenSheet: React.FC<MobileFullScreenSheetProps> = ({ isOpen, children, slideFrom = "bottom" }) => {
  if (typeof document === "undefined") return null;

  const offscreen = slideFrom === "right" ? { x: "100%" } : { y: "100%" };
  const onscreen = slideFrom === "right" ? { x: 0 } : { y: 0 };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.fullScreen}
          initial={offscreen}
          animate={onscreen}
          exit={offscreen}
          transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MobileFullScreenSheet;

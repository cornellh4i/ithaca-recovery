"use client";

import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import styles from "../../../styles/components/atoms/MobileFullScreenSheet.module.scss";

interface MobileFullScreenSheetProps {
  isOpen: boolean;
  children: React.ReactNode;
}

// Full-screen slide-up wrapper for New/Edit Meeting on mobile -- a simple, standard
// conditional-render-inside-AnimatePresence (not a repeatedly-key-swapped child), which is
// the case AnimatePresence's exit/unmount actually handles reliably (see WeekStrip.tsx's
// comment for the pattern that doesn't).
const MobileFullScreenSheet: React.FC<MobileFullScreenSheetProps> = ({ isOpen, children }) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.fullScreen}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
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

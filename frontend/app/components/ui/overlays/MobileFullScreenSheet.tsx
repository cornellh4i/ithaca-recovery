"use client";

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useDialogBehavior } from "../../../../hooks/useDialogBehavior";
import styles from "./MobileFullScreenSheet.module.scss";

// Distance/velocity a drag needs to clear before it counts as "swipe to dismiss" -- same
// thresholds BottomSheet's own drag-to-dismiss uses, for a consistent feel across the app's
// swipe-to-dismiss surfaces.
const DISMISS_OFFSET_PX = 100;
const DISMISS_VELOCITY = 500;

interface MobileFullScreenSheetProps {
  isOpen: boolean;
  children: React.ReactNode;
  // "bottom" (default) for New/Edit Meeting; "right" for the profile-icon -> login slide-in
  // (MobileLoginSheet), which per spec slides in from the right instead of sliding up.
  slideFrom?: "bottom" | "right";
  // Opt-in drag-to-dismiss, in the same direction this sheet slides back out to (right for
  // "right", down for "bottom") -- e.g. MobileLoginSheet's swipe-back gesture. Off by default
  // (undefined) so New/Edit Meeting's scrollable form fields aren't affected by a gesture they
  // never asked for.
  onSwipeDismiss?: () => void;
  // Escape-to-close and part of the dialog contract (see useDialogBehavior) -- independent of
  // onSwipeDismiss (drag), which stays opt-in per caller. Optional since some hosts (e.g.
  // New/Edit Meeting) only ever close via their own in-form Cancel/X button.
  onClose?: () => void;
  // Accessible name for the dialog -- no current caller has a heading with a stable id to
  // point aria-labelledby at, so this mirrors Modal's own ariaLabel fallback path.
  ariaLabel?: string;
}

// Full-screen slide wrapper for New/Edit Meeting and the mobile login sheet -- a simple,
// standard conditional-render-inside-AnimatePresence (not a repeatedly-key-swapped child),
// which is the case AnimatePresence's exit/unmount actually handles reliably (see
// WeekStrip.tsx's comment for the pattern that doesn't).
const MobileFullScreenSheet: React.FC<MobileFullScreenSheetProps> = ({
  isOpen,
  children,
  slideFrom = "bottom",
  onSwipeDismiss,
  onClose,
  ariaLabel,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ isOpen, onClose, contentRef });

  if (typeof document === "undefined") return null;

  const offscreen = slideFrom === "right" ? { x: "100%" } : { y: "100%" };
  const onscreen = slideFrom === "right" ? { x: 0 } : { y: 0 };

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const past =
      slideFrom === "right"
        ? info.offset.x > DISMISS_OFFSET_PX || info.velocity.x > DISMISS_VELOCITY
        : info.offset.y > DISMISS_OFFSET_PX || info.velocity.y > DISMISS_VELOCITY;
    if (past) onSwipeDismiss?.();
  };

  // touchAction: "pan-y" so a vertical scroll inside (e.g. LoginCard content taller than the
  // viewport) still passes through natively alongside the horizontal drag recognition -- same
  // reasoning as DayPortraitView's .scrollArea/.carouselTrack, the other place a horizontal
  // drag and vertical scroll need to coexist on the same element. Only meaningful when
  // slideFrom is "right" (an "x" drag); the "bottom" case drags "y", the same axis as the
  // scroll it's already layered on, so there's no orthogonal gesture to keep separate.
  const dragProps = onSwipeDismiss
    ? {
        drag: (slideFrom === "right" ? "x" : "y") as "x" | "y",
        dragConstraints: slideFrom === "right" ? { left: 0, right: Infinity } : { top: 0, bottom: Infinity },
        dragElastic: slideFrom === "right" ? { left: 0, right: 0.5 } : { top: 0, bottom: 0.5 },
        onDragEnd: handleDragEnd,
        ...(slideFrom === "right" ? { style: { touchAction: "pan-y" } } : {}),
      }
    : {};

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={contentRef}
          className={styles.fullScreen}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          initial={offscreen}
          animate={onscreen}
          exit={offscreen}
          transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
          {...dragProps}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MobileFullScreenSheet;

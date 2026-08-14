"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useViewport } from "../../../../hooks/useViewport";
import styles from "../../../../styles/components/ui/overlays/BottomSheet.module.scss";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // For content (e.g. ViewMeeting) that already renders its own visible header/title --
  // title is still required for the dialog's accessible name, just not shown a second time.
  hideTitleVisually?: boolean;
}

// Dragging down past this offset (or fast enough downward, regardless of distance) dismisses
// the sheet -- mirrors typical native bottom-sheet feel rather than requiring a full drag to
// the bottom edge.
const DISMISS_OFFSET_PX = 100;
const DISMISS_VELOCITY = 500;

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  hideTitleVisually = false,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Landscape phones have too little vertical room left for a partial-height sheet (80vh of
  // a ~390px-tall viewport is cramped further still by the bottom-anchored inset) -- goes
  // full-screen there instead. Portrait and desktop keep the usual bottom-anchored sheet.
  const viewport = useViewport();
  const isLandscapePhone = viewport?.device === "phone" && viewport.orientation === "landscape";

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    // Body scroll-lock while open -- same overflow:hidden toggling idiom already used by
    // CalendarSidebarShell/ViewMeeting for the same reason (nothing scrollable underneath
    // should move while this is up).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET_PX || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={`${styles.sheet} ${isLandscapePhone ? styles.fullScreen : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={sheetRef}
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            drag="y"
            // bottom intentionally unbounded (not 0) -- a {top:0, bottom:0} constraint locks
            // y in place entirely, which also clamps the exit animation's own y:"100%" target
            // since drag constraints apply to programmatic animation of the same value, not
            // just user dragging (same bug class WeekStrip's swipe hit, see its own comment).
            dragConstraints={{ top: 0, bottom: Infinity }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
          >
            <div className={styles.grabber} />
            <h2 className={hideTitleVisually ? styles.titleVisuallyHidden : styles.title}>{title}</h2>
            <div className={styles.content}>{children}</div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default BottomSheet;

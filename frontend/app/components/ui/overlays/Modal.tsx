"use client";

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogBehavior } from "../../../../hooks/useDialogBehavior";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  overlayClassName?: string;
  contentClassName?: string;
  // Inline styles for the dialog element itself -- for callers that position the dialog
  // dynamically (e.g. OverlapMeetingsPopover anchoring beside a clicked element). Positioning
  // must land on this element, not a child: the dialog div is what assistive tech and tests
  // resolve as the dialog, and a zero-size static wrapper around a fixed-position child reads
  // as hidden.
  contentStyle?: React.CSSProperties;
  // The id of the element (usually the dialog's own heading) that names it for assistive
  // tech. Falls back to ariaLabel when the dialog has no such element to point at.
  labelledBy?: string;
  ariaLabel?: string;
  // Blocks Escape and overlay-click dismissal (e.g. while a submit request from inside the
  // modal is in flight) -- the caller's own explicit Cancel button, if any, is unaffected;
  // this only covers the two implicit dismiss paths Modal itself provides.
  preventClose?: boolean;
}

// Shared accessible dialog shell for the admin panel's confirm/edit modals (EditRoleModal,
// InviteUserModal, RemoveUserModal), which previously each hand-rolled their own overlay with
// no dialog semantics, no focus trap, and no focus restoration. Purely a chrome/behavior
// wrapper -- callers still own their own header/body/button markup and CSS module classes.
const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  overlayClassName,
  contentClassName,
  contentStyle,
  labelledBy,
  ariaLabel,
  preventClose = false,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ isOpen, onClose, contentRef, preventClose });

  if (!isOpen) return null;

  return createPortal(
    <div
      className={overlayClassName}
      // Host components that portal themselves (e.g. ViewMeeting) may run their own
      // outside-click-closes-me listener keyed off DOM containment. Once this modal is *also*
      // portaled to document.body, it's a sibling of such a host, not a descendant, so a click
      // anywhere in here would misread as "outside" without this hook -- mirrors the existing
      // [data-datepicker-popup] / [data-user-menu-popup] escape-hatch convention.
      data-modal-popup="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !preventClose) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={contentClassName}
        style={contentStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;

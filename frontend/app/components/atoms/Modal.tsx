"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  overlayClassName?: string;
  contentClassName?: string;
  // The id of the element (usually the dialog's own heading) that names it for assistive
  // tech. Falls back to ariaLabel when the dialog has no such element to point at.
  labelledBy?: string;
  ariaLabel?: string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  labelledBy,
  ariaLabel,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Read inside the keydown handler instead of putting onClose in that effect's deps -- none
  // of this Modal's callers memoize their onClose/onCancel handlers, so a plain dependency
  // would re-subscribe the listener (and, if bundled with the focus-capture effect below,
  // re-run focus restoration/re-capture) on every parent re-render while the modal is still
  // open, yanking focus out and back for no reason.
  const onCloseRef = useRef(onClose);
  // Assigned in an effect, not inline during render -- mutating a ref's value while rendering
  // is unsafe under React's rules (concurrent rendering/StrictMode can render without
  // committing). useLayoutEffect, not useEffect, so the ref is current before the keydown
  // effect below or any paint could observe a stale value.
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Capture-and-autofocus / restore-on-unmount, deps on isOpen only -- this must run exactly
  // once per open/close transition, not on every re-render a parent causes while open (e.g.
  // InviteUserModal's onCancel identity changes when handleInvite sets `inviting`).
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Moves focus into the dialog once it's painted, so keyboard/screen-reader users land
    // inside it immediately rather than staying on whatever was focused on the page behind it.
    const focusables = contentRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusables?.[0]?.focus();

    return () => {
      // Restores focus to whatever triggered the dialog (e.g. the kebab menu's "Edit Role"
      // button) rather than leaving focus lost on the now-removed dialog content.
      previouslyFocused.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = contentRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      // Wraps Tab/Shift+Tab at the dialog's edges instead of letting focus escape onto the
      // (inert but still tabbable-by-default) page behind the overlay.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={overlayClassName}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={contentClassName}
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

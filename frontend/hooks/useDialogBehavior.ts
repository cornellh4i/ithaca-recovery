import { useEffect, useRef, type RefObject } from "react";
import { useIsomorphicLayoutEffect } from "./useViewport";

export const DIALOG_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-scope stack of currently-open dialogs (by hook-instance id), topmost/most-recently-
// opened last. A dialog opened *inside* another (e.g. ConflictOverrideModal opened from within
// New Meeting's MobileFullScreenSheet) is a DOM sibling of its host under document.body, not a
// descendant -- both dialogs' Escape listeners are separate handlers on the same `document`
// node, so DOM containment/event.stopPropagation can't distinguish "inner" from "outer" (every
// listener on a node fires regardless of another same-node listener's propagation state). Only
// the topmost dialog on this stack responds to Escape, so closing the inner modal doesn't also
// discard the form underneath it.
//
// Ordering is by open-effect commit order, not real DOM/visual nesting (there is none to read,
// per above) -- correct for every actual call site here, since a nested dialog (e.g.
// ConflictOverrideModal) only ever opens in response to a user action *after* its host is
// already open and mounted, never in the same commit as its host.
let nextDialogId = 0;
const openDialogStack: number[] = [];

export interface UseDialogBehaviorOptions {
  isOpen: boolean;
  // Optional -- MobileFullScreenSheet's New/Edit Meeting call sites had no dismiss action at
  // all before this hook existed (Cancel lived entirely inside the form), so Escape-to-close
  // is opt-in rather than assumed.
  onClose?: () => void;
  // The dialog's own content root -- Tab/Shift+Tab wrap at the first/last focusable descendant
  // found inside it, and (absent initialFocusRef) it's also where the initial-focus search runs.
  contentRef: RefObject<HTMLElement | null>;
  // Overrides what receives focus on open -- BottomSheet focuses its own (tabIndex=-1) root
  // instead of the first focusable descendant, since that root is itself the draggable surface.
  initialFocusRef?: RefObject<HTMLElement | null>;
  // Blocks Escape-to-close (e.g. a submit request in flight) -- mirrors Modal's own prop.
  preventClose?: boolean;
}

// Shared dialog behavior -- initial focus, Tab/Shift+Tab focus trap, Escape-to-close, and
// focus restoration on close -- extracted from Modal.tsx so BottomSheet and
// MobileFullScreenSheet (which can't just wrap Modal: both need their own portal/overlay
// structure for drag-to-dismiss via motion/react) can provide the same dialog semantics.
export function useDialogBehavior({
  isOpen,
  onClose,
  contentRef,
  initialFocusRef,
  preventClose = false,
}: UseDialogBehaviorOptions): void {
  // Read inside the keydown handler instead of putting onClose in that effect's deps -- none
  // of this hook's callers memoize their onClose, so a plain dependency would re-subscribe the
  // listener on every parent re-render while the dialog is still open.
  const onCloseRef = useRef(onClose);
  const preventCloseRef = useRef(preventClose);
  // Assigned in an effect, not inline during render -- mutating a ref's value while rendering
  // is unsafe under React's rules. useIsomorphicLayoutEffect (useLayoutEffect on the client,
  // useEffect during SSR -- see useViewport.ts) so the ref is current before the keydown effect
  // below or any paint could observe a stale value, without React's server-render warning.
  useIsomorphicLayoutEffect(() => {
    onCloseRef.current = onClose;
    preventCloseRef.current = preventClose;
  });

  // Lazily assigns a stable id the first time this hook instance runs -- mutating a ref during
  // render like this is safe (and the idiomatic lazy-init pattern) since it's idempotent after
  // the first call, unlike mutating state.
  const dialogIdRef = useRef<number | null>(null);
  if (dialogIdRef.current === null) dialogIdRef.current = nextDialogId++;

  // Registers this dialog on the shared open-stack for as long as it's open (see the stack's
  // own comment above) -- independent of the focus-management effect below, which cares about
  // *this* dialog's own focus regardless of nesting.
  useEffect(() => {
    if (!isOpen) return;
    const id = dialogIdRef.current as number;
    openDialogStack.push(id);
    return () => {
      const index = openDialogStack.indexOf(id);
      if (index !== -1) openDialogStack.splice(index, 1);
    };
  }, [isOpen]);

  // Capture-and-autofocus / restore-on-unmount, deps on isOpen only -- must run exactly once
  // per open/close transition, not on every re-render a parent causes while open.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const target =
      initialFocusRef?.current ??
      contentRef.current?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)[0];
    target?.focus();

    return () => {
      previouslyFocused?.focus();
    };
    // contentRef/initialFocusRef are ref objects -- stable across renders, so including them
    // doesn't change when this re-runs, but does satisfy exhaustive-deps (it can't infer
    // ref-stability for a ref passed in as a hook parameter the way it can for a local useRef).
  }, [isOpen, contentRef, initialFocusRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Only the topmost (most-recently-opened) dialog closes on Escape -- see the stack's
        // own comment above for why DOM containment/stopPropagation can't do this instead.
        const isTopmost = openDialogStack[openDialogStack.length - 1] === dialogIdRef.current;
        if (isTopmost && !preventCloseRef.current) onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = contentRef.current?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR);
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
  }, [isOpen, contentRef]);
}

import { useEffect, useRef, type RefObject } from "react";
import { useIsomorphicLayoutEffect } from "./useViewport";
import { LAYER_FOCUSABLE_SELECTOR, useLayerStack } from "./useDismissibleLayer";

export const DIALOG_FOCUSABLE_SELECTOR = LAYER_FOCUSABLE_SELECTOR;

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
// Registers on the same layer stack as useDismissibleLayer, so Escape ordering is consistent
// between dialogs and non-dialog layers (menus, dropdowns, the ViewMeeting popup).
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

  // Registers this dialog on the shared layer stack for as long as it's open -- independent of
  // the focus-management effect below, which cares about *this* dialog's own focus regardless
  // of nesting.
  const layer = useLayerStack(isOpen, contentRef);

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
        // Only the topmost (most-recently-opened) layer closes on Escape -- see useLayerStack's
        // own comment for why DOM containment/stopPropagation can't do this instead.
        if (layer.isTopmost() && !preventCloseRef.current) onCloseRef.current?.();
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
  }, [isOpen, contentRef, layer]);
}

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useIsomorphicLayoutEffect } from "./useViewport";

export const LAYER_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Portaled children that are DOM siblings of their logical parent layer rather than
// descendants, so DOM containment alone reads a click inside them as "outside" the layer that
// owns them. Stack entries are already covered by containsFromHereUp below; this covers the
// portals that aren't stack entries (DatePicker's calendar popup) and the parts of one that sit
// outside its registered content root (Modal's overlay, around its dialog).
const NESTED_PORTAL_SELECTOR = "[data-modal-popup], [data-datepicker-popup]";

interface LayerEntry {
  id: number;
  contentRef: RefObject<HTMLElement | null>;
}

// Module-scope stack of every currently-open dismissible layer (dialogs, popups, menus,
// dropdowns), topmost/most-recently-opened last. A layer opened *inside* another (a modal opened
// from within a sheet, ViewMeeting's kebab menu inside its self-portaled popup) is usually a DOM
// sibling of its host under document.body, not a descendant -- both layers' Escape listeners are
// separate handlers on the same `document` node, so DOM containment/event.stopPropagation can't
// distinguish "inner" from "outer" (every listener on a node fires regardless of another
// same-node listener's propagation state). Only the topmost layer responds to Escape, so closing
// an inner menu doesn't also discard the popup underneath it.
//
// Ordering is by open-effect commit order, not real DOM/visual nesting (there is none to read,
// per above) -- correct for every actual call site, since a nested layer only ever opens in
// response to a user action *after* its host is already open and mounted.
let nextLayerId = 0;
const layerStack: LayerEntry[] = [];

export interface LayerStackHandle {
  isTopmost: () => boolean;
  // Whether a click landed inside this layer or anything stacked above it -- the portal-aware
  // replacement for `contentRef.current.contains(target)`.
  containsFromHereUp: (node: Node) => boolean;
}

// Registers a layer on the shared stack for as long as it is open, and exposes the two ordering
// questions every dismissal path needs to ask.
export function useLayerStack(
  isOpen: boolean,
  contentRef: RefObject<HTMLElement | null>,
): LayerStackHandle {
  // Lazily assigns a stable id the first time this hook instance runs -- mutating a ref during
  // render like this is safe (and the idiomatic lazy-init pattern) since it's idempotent after
  // the first call, unlike mutating state.
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) idRef.current = nextLayerId++;

  useEffect(() => {
    if (!isOpen) return;
    const entry: LayerEntry = { id: idRef.current as number, contentRef };
    layerStack.push(entry);
    return () => {
      const index = layerStack.indexOf(entry);
      if (index !== -1) layerStack.splice(index, 1);
    };
    // contentRef is a ref object -- stable across renders, listed only for exhaustive-deps.
  }, [isOpen, contentRef]);

  // Stable identity so callers can safely list the handle in their own effect deps.
  return useMemo<LayerStackHandle>(
    () => ({
      isTopmost: () => layerStack[layerStack.length - 1]?.id === idRef.current,
      containsFromHereUp: (node: Node) => {
        const index = layerStack.findIndex((entry) => entry.id === idRef.current);
        if (index === -1) return false;
        return layerStack
          .slice(index)
          .some((entry) => entry.contentRef.current?.contains(node) ?? false);
      },
    }),
    [],
  );
}

export interface UseDismissibleLayerOptions {
  isOpen: boolean;
  onDismiss: () => void;
  // The layer's own content root. Clicks inside it (or inside anything stacked above it) never
  // count as outside clicks.
  contentRef: RefObject<HTMLElement | null>;
  // Extra element that must not read as "outside" -- the trigger that opened this layer, when it
  // lives outside contentRef (ViewMeeting's anchoring calendar box, whose own onClick already
  // owns the toggle). A trigger *inside* contentRef needs nothing here.
  ignoreEl?: HTMLElement | null;
  // Overrides what receives focus on open; defaults to the first focusable descendant of
  // contentRef.
  initialFocusRef?: RefObject<HTMLElement | null>;
  // Opt out of moving focus into the layer on open (and of restoring it on close) -- for layers
  // whose host already owns focus management.
  manageFocus?: boolean;
  closeOnOutsideClick?: boolean;
  closeOnEscape?: boolean;
}

// Shared dismissal behavior for any layered UI that is not a full dialog: Escape-to-close
// targeting only the topmost layer, portal-aware outside-click-to-close, and focus in/out.
// Dialogs use useDialogBehavior instead, which adds a focus trap and shares this same stack so
// Escape ordering is consistent across both kinds of layer.
export function useDismissibleLayer({
  isOpen,
  onDismiss,
  contentRef,
  ignoreEl,
  initialFocusRef,
  manageFocus = true,
  closeOnOutsideClick = true,
  closeOnEscape = true,
}: UseDismissibleLayerOptions): void {
  const layer = useLayerStack(isOpen, contentRef);

  // Read inside the handlers instead of putting onDismiss in the effects' deps -- callers don't
  // memoize it, so a plain dependency would re-subscribe the listeners on every parent re-render
  // while the layer is still open.
  const onDismissRef = useRef(onDismiss);
  const ignoreElRef = useRef(ignoreEl);
  useIsomorphicLayoutEffect(() => {
    onDismissRef.current = onDismiss;
    ignoreElRef.current = ignoreEl;
  });

  // Deps on isOpen only -- must run exactly once per open/close transition, not on every
  // re-render a parent causes while open.
  useEffect(() => {
    if (!isOpen || !manageFocus) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const target =
      initialFocusRef?.current ??
      contentRef.current?.querySelectorAll<HTMLElement>(LAYER_FOCUSABLE_SELECTOR)[0];
    target?.focus();

    return () => {
      previouslyFocused?.focus();
    };
    // contentRef/initialFocusRef are ref objects -- stable across renders, so including them
    // doesn't change when this re-runs, but does satisfy exhaustive-deps.
  }, [isOpen, manageFocus, contentRef, initialFocusRef]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!layer.isTopmost()) return;
      onDismissRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, layer]);

  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (layer.containsFromHereUp(target)) return;
      if (ignoreElRef.current?.contains(target)) return;
      if ((target as Element).closest?.(NESTED_PORTAL_SELECTOR)) return;
      onDismissRef.current();
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, closeOnOutsideClick, layer]);
}

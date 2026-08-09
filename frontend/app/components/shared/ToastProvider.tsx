"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useViewport } from "../../../hooks/useViewport";
import Toast, { type ToastAction, type ToastVariant } from "./Toast";
import styles from "../../../styles/components/shared/Toast.module.scss";

export interface ToastOptions {
  variant: ToastVariant;
  title: string;
  description?: string | string[];
  // Inline links below the description (e.g. "Retry Zoom" / "View meeting") -- not used by any
  // call site yet, but part of the design so a future flow can attach follow-up actions without
  // a Toast/ToastProvider API change.
  actions?: ToastAction[];
  // Overrides the variant's default dismiss behavior (success/info auto-dismiss, warning/error
  // stay until closed) -- e.g. forcing a persistent info toast for AdminShell's responsive
  // notice, or forcing a non-persistent error for a case that genuinely doesn't need one.
  persistent?: boolean;
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: string;
}

// Newest visually on top, oldest nearest the corner anchor -- a 4th toast evicts the oldest
// rather than queuing behind it, since warning/error toasts are persistent-until-closed and an
// unbounded queue of those would never drain on its own.
const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS = 4000;

// success/info are transient status updates; warning/error need explicit acknowledgment since
// they're persistent-until-closed by default.
const DEFAULT_PERSISTENT: Record<ToastVariant, boolean> = {
  success: false,
  info: false,
  warning: true,
  error: true,
};

let nextId = 0;

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const viewport = useViewport();
  const prefersReducedMotion = useReducedMotion();
  // The portal must not render during the initial client render -- `document` is undefined
  // during SSR but defined on the client, so gating on `typeof document` directly flips
  // between server and client output on the very first paint and triggers a hydration
  // mismatch. Delaying to a post-mount effect keeps first paint identical to SSR (no portal
  // either way); the portal then appears via ordinary reconciliation, which isn't subject to
  // hydration diffing.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Deliberately just flips a flag to trigger the post-mount render described above --
    // not synchronizing with any external system, so this doesn't fit the rule's usual case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const id = `toast-${nextId++}`;
    const persistent = options.persistent ?? DEFAULT_PERSISTENT[options.variant];
    const entry: ToastEntry = { ...options, id, persistent };

    setToasts((prev) => {
      const next = [entry, ...prev];
      const evicted = next.slice(MAX_TOASTS);
      evicted.forEach((toast) => {
        const timer = timers.current.get(toast.id);
        if (timer) {
          clearTimeout(timer);
          timers.current.delete(toast.id);
        }
      });
      return next.slice(0, MAX_TOASTS);
    });

    if (!persistent) {
      const timer = setTimeout(() => dismiss(id), options.duration ?? DEFAULT_DURATION_MS);
      timers.current.set(id, timer);
    }

    return id;
  }, [dismiss]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const positionClass =
    viewport?.device === "phone"
      ? viewport.orientation === "landscape"
        ? styles.positionPhoneLandscape
        : styles.positionPhonePortrait
      : styles.positionDesktop;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted &&
        createPortal(
          <div className={`${styles.container} ${positionClass}`}>
            <AnimatePresence>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, ease: "easeOut" }}
                >
                  <Toast
                    variant={toast.variant}
                    title={toast.title}
                    description={toast.description}
                    actions={toast.actions}
                    onClose={() => dismiss(toast.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useViewport } from "../../../hooks/useViewport";
import Toast, { type ToastVariant } from "./Toast";
import styles from "../../../styles/components/shared/Toast.module.scss";

export interface ToastOptions {
  variant: ToastVariant;
  message: string | string[];
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
      {typeof document !== "undefined" &&
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
                  <Toast variant={toast.variant} message={toast.message} onClose={() => dismiss(toast.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

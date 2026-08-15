import React from "react";
import Icon, { IconName } from "../ui/displays/Icon";
import styles from "./Toast.module.scss";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: styles.success,
  error: styles.error,
  warning: styles.warning,
  info: styles.info,
};

// Error reuses the close glyph (an X) rather than a distinct "error" icon -- same shape the
// dismiss button uses, but rendered in the variant's accent color at the opposite corner,
// which is how the design reference distinguishes the two.
const VARIANT_ICON: Record<ToastVariant, IconName> = {
  success: "check",
  error: "close",
  warning: "warning-amber",
  info: "warning-circle",
};

export interface ToastProps {
  variant: ToastVariant;
  title: string;
  description?: string | string[];
  actions?: ToastAction[];
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ variant, title, description, actions, onClose }) => {
  return (
    <div
      className={`${styles.toast} ${VARIANT_CLASS[variant]}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <span className={styles.icon}>
        <Icon name={VARIANT_ICON[variant]} size={20} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {description &&
          (Array.isArray(description) ? (
            <ul className={styles.messageList}>
              {description.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.description}>{description}</p>
          ))}
        {actions && actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((action, index) => (
              <button key={index} type="button" className={styles.actionLink} onClick={action.onClick}>
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className={styles.closeButton} aria-label="Dismiss" onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
    </div>
  );
};

export default Toast;

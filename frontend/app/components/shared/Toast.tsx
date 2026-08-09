import React from "react";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import styles from "../../../styles/components/shared/Toast.module.scss";

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

// Error reuses CloseIcon (an X) rather than a distinct "error" glyph -- same shape the
// dismiss button uses, but rendered in the variant's accent color at the opposite corner,
// which is how the design reference distinguishes the two.
const VARIANT_ICON: Record<ToastVariant, React.ElementType> = {
  success: CheckIcon,
  error: CloseIcon,
  warning: WarningAmberIcon,
  info: InfoOutlinedIcon,
};

export interface ToastProps {
  variant: ToastVariant;
  title: string;
  description?: string | string[];
  actions?: ToastAction[];
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ variant, title, description, actions, onClose }) => {
  const Icon = VARIANT_ICON[variant];
  return (
    <div
      className={`${styles.toast} ${VARIANT_CLASS[variant]}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <span className={styles.icon}>
        <Icon fontSize="small" />
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
        <CloseIcon fontSize="small" />
      </button>
    </div>
  );
};

export default Toast;

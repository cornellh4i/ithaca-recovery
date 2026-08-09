import React from "react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CloseIcon from "@mui/icons-material/Close";
import styles from "../../../styles/components/shared/Toast.module.scss";

export type ToastVariant = "success" | "error" | "warning" | "info";

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: styles.success,
  error: styles.error,
  warning: styles.warning,
  info: styles.info,
};

const VARIANT_ICON: Record<ToastVariant, React.ElementType> = {
  success: CheckCircleOutlineIcon,
  error: ErrorOutlineIcon,
  warning: WarningAmberIcon,
  info: InfoOutlinedIcon,
};

export interface ToastProps {
  variant: ToastVariant;
  message: string | string[];
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ variant, message, onClose }) => {
  const Icon = VARIANT_ICON[variant];
  return (
    <div
      className={`${styles.toast} ${VARIANT_CLASS[variant]}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <span className={styles.iconCircle}>
        <Icon fontSize="small" />
      </span>
      <div className={styles.body}>
        {Array.isArray(message) ? (
          <ul className={styles.messageList}>
            {message.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        ) : (
          message
        )}
      </div>
      <button className={styles.closeButton} aria-label="Dismiss" onClick={onClose}>
        <CloseIcon fontSize="small" />
      </button>
    </div>
  );
};

export default Toast;

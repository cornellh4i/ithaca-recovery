import React, { useLayoutEffect, useRef } from "react";
import Icon from "../ui/displays/Icon";
import type { MeetingFormFieldError } from "../../../hooks/useMeetingForm";
import styles from "./FormValidationBanner.module.scss";

interface FormValidationBannerProps {
  errors: MeetingFormFieldError[];
}

// Walks up from the banner to find the actual scrolling ancestor -- neither NewMeeting nor
// EditMeeting owns that container directly (it's CalendarSidebarShell's .sidebarScroll on
// desktop, MobileFullScreenSheet's .fullScreen on mobile), and matching by computed overflow
// rather than by class name keeps this working if either of those containers is restyled.
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

const FormValidationBanner: React.FC<FormValidationBannerProps> = ({ errors }) => {
  const bannerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const lastHeightRef = useRef(0);
  const wasVisibleRef = useRef(false);

  const visible = errors.length > 0;

  useLayoutEffect(() => {
    if (visible) {
      if (bannerRef.current) {
        containerRef.current = containerRef.current ?? findScrollableAncestor(bannerRef.current);
        lastHeightRef.current = bannerRef.current.offsetHeight;
      }
      if (!wasVisibleRef.current) {
        containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else if (wasVisibleRef.current && containerRef.current) {
      // The banner just left the flow above the form -- without this, the container's
      // remaining content jumps up by exactly the height that used to be reserved for it.
      containerRef.current.scrollTop = Math.max(0, containerRef.current.scrollTop - lastHeightRef.current);
    }
    wasVisibleRef.current = visible;
  }, [visible, errors]);

  if (!visible) return null;

  const fieldCount = new Set(errors.flatMap((error) => error.fields)).size;

  return (
    <div className={styles.banner} ref={bannerRef} role="alert">
      <span className={styles.iconCircle}>
        <Icon name="error-outline" size={20} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>
          Fix {fieldCount} {fieldCount === 1 ? "field" : "fields"} before saving
        </p>
        <ul className={styles.messageList}>
          {errors.map((error, index) => (
            <li key={index}>{error.message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default FormValidationBanner;

"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import Logo from "../ui/displays/Logo";
import styles from "../../../styles/components/navigation/MobileAppSidebar.module.scss";

interface MobileAppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// Mobile hamburger-menu drawer. Reuses the exact Link + usePathname + isAdmin gating logic
// AppNavigation.tsx's desktop nav list already has (session-derived, not prop-driven) so the two
// stay in lockstep without duplicating auth state through props.
const MobileAppSidebar: React.FC<MobileAppSidebarProps> = ({ isOpen, onClose }) => {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
  const pathname = usePathname();

  const rowClass = (isActive: boolean) => `${styles.row} ${isActive ? styles.active : ""}`;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
          >
            <div className={styles.logoRow}>
              <Logo />
            </div>
            <hr className={styles.separator} />
            <nav className={styles.nav}>
              <Link href="/" className={rowClass(pathname === "/")} onClick={onClose}>
                Main Calendar
              </Link>
              <Link href="/docs" className={rowClass(pathname?.startsWith("/docs") ?? false)} onClick={onClose}>
                Resources
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={rowClass(pathname?.startsWith("/admin") ?? false)}
                  onClick={onClose}
                >
                  Admin
                </Link>
              )}
              {status === "unauthenticated" && (
                <Link href="/login" className={rowClass(false)} onClick={onClose}>
                  Sign In
                </Link>
              )}
            </nav>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MobileAppSidebar;

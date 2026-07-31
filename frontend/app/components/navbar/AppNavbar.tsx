"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../atoms/Logo";
import Tooltip from "../atoms/Tooltip";
import ProfileCard from "./ProfileCard";
import MobileAppNavbar from "./MobileAppNavbar";
import { useIsPhone } from "../../../hooks/useIsPhone";
import { useUserAvatar } from "../../../hooks/useUserAvatar";
import styles from "../../../styles/components/navbar/AppNavbar.module.scss";

const AppNavbar: React.FC = () => {
    const isPhone = useIsPhone();
    const { session, status, userAvatar } = useUserAvatar(styles.avatar, styles.avatarFallback);

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
    const pathname = usePathname();
    const navItemClass = (isActive: boolean) => `btn btn-ghost ${isActive ? styles.active : ""}`;

    const [openFlyout, setOpenFlyout] = useState<boolean>(false);
    const flyoutRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close flyout on outside click or Escape key press
    useEffect(() => {
        if (!openFlyout) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
                setOpenFlyout(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpenFlyout(false);
                buttonRef.current?.focus(); // Return focus to the trigger button
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openFlyout]);

    // null means useIsPhone() hasn't resolved yet (no window on the server, client hasn't
    // measured) -- render nothing rather than falling through to the desktop nav below,
    // which is exactly the flash on a real phone useIsPhone's own layout-effect fix already
    // guards against; a null check here is the other half of that fix.
    if (isPhone === null) {
        return null;
    }

    if (isPhone) {
        return <MobileAppNavbar session={session} status={status} userAvatar={userAvatar} />;
    }

    return (
        <div className={styles.navbar}>
            <div className={styles.navcontainer}>
                <div className={styles.navLeft}>
                    <Logo />
                </div>
                <ul className={styles.navigationlist}>
                    <li className={navItemClass(pathname === "/")}>
                        <Tooltip content="Live calendar — add, edit, or delete meetings">
                            <Link href="/">
                                <p>Main Calendar</p>
                            </Link>
                        </Tooltip>
                    </li>
                    <li className={navItemClass(pathname === "/signage")}>
                        <Tooltip content="Read-only calendar view for signage">
                            <Link href="/signage">
                                <p>Signage</p>
                            </Link>
                        </Tooltip>
                    </li>
                    <li className={navItemClass(pathname?.startsWith("/admin") ?? false)}>
                        {isAdmin ? (
                            <Tooltip content="Manage users, imports, exports, and diagnostics">
                                <Link href="/admin">
                                    <p>Admin</p>
                                </Link>
                            </Tooltip>
                        ) : session ? (
                            <Tooltip content="Requires admin access">
                                <button className={styles.navLocked} disabled>
                                    <p>Admin</p>
                                    <img src="/svg/lock-icon.svg" alt="" className={styles.lockIcon} />
                                </button>
                            </Tooltip>
                        ) : (
                            <Tooltip content="Sign in to access Admin">
                                <Link href="/login" className={styles.navLockedLink}>
                                    <p>Admin</p>
                                    <img src="/svg/lock-icon.svg" alt="" className={styles.lockIcon} />
                                </Link>
                            </Tooltip>
                        )}
                    </li>
                    <li>
                        {status === "loading" ? (
                            <div className={styles.signInButton} style={{ opacity: 0, pointerEvents: "none" }}>
                                <p>Loading...</p>
                            </div>
                        ) : session && session.user ? (
                            <div className={styles.flyoutAnchor} ref={flyoutRef}>
                                <Tooltip content="User menu">
                                    <button
                                        ref={buttonRef}
                                        type="button"
                                        aria-label="User menu"
                                        aria-haspopup="dialog"
                                        aria-expanded={openFlyout}
                                        aria-controls="user-profile-flyout"
                                        className={styles.profileButton}
                                        onClick={() => setOpenFlyout((prev) => !prev)}
                                    >
                                        {userAvatar}
                                    </button>
                                </Tooltip>
                                {openFlyout && (
                                    <div
                                        id="user-profile-flyout"
                                        className={styles.flyout}
                                    >
                                        <ProfileCard session={session} userAvatar={userAvatar} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Link className={styles.signInButton} href="/login">
                                <p>Sign In</p>
                            </Link>
                        )}
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default AppNavbar;
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../atoms/Logo";
import { useSession, signOut } from "next-auth/react";
import Tooltip from "../atoms/Tooltip";
import styles from "../../../styles/components/navbar/AppNavbar.module.scss";

const AppNavbar: React.FC = () => {
    const { data: session, status } = useSession();

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
    const pathname = usePathname();
    const navItemClass = (isActive: boolean) => `btn btn-ghost ${isActive ? styles.active : ""}`;

    const [openFlyout, setOpenFlyout] = useState<boolean>(false);
    const [imageError, setImageError] = useState(false);
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

    // Pre-verify image URL viability when session updates
    useEffect(() => {
        const imageUrl = session?.user?.image;
        if (!imageUrl) {
            setImageError(true);
            return;
        }

        let isCurrent = true;
        const img = new Image();
        img.src = imageUrl;

        img.onload = () => { if (isCurrent) setImageError(false)};
        img.onerror = () => { if (isCurrent) setImageError(true)};

        return () => {
            isCurrent = false;
        };
    }, [session?.user?.image]);

    const userAvatar = (
        session?.user.image && !imageError ? (
            <img
                src={session.user.image}
                alt={session.user.name ?? "User avatar"}
                title={session.user.name ?? "Account"}
                className={styles.avatar}
                onError={() => setImageError(true)}
            />
        ) : (
            <div className={styles.avatarFallback}>{session?.user.name?.[0] ?? "U"}</div>
        )
    );

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
                                        <div className={styles.flyoutHeader}>
                                            {userAvatar}
                                            <div className={styles.flyoutInfo}>
                                                <span className={styles.welcome}>Hi, {session.user.name}</span>
                                                <span className={styles.flyoutEmail}>{session.user.email}</span>
                                                <span className={styles.flyoutRole}>
                                                    {session.user.role === "SUPER_ADMIN"
                                                        ? "Super Admin"
                                                        : session.user.role === "ADMIN"
                                                        ? "Admin"
                                                        : "User"}
                                                </span>
                                            </div>
                                        </div>
                                        <hr className={styles.flyoutSeparator} />
                                        <button
                                            type="button"
                                            className={styles.signOutButton}
                                            onClick={() => signOut({ callbackUrl: "/" })}
                                        >
                                            <span>Sign Out</span>
                                        </button>
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
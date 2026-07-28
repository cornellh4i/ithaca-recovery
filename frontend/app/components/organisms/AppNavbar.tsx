"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../atoms/Logo";
import IconButton from "../atoms/IconButton";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import Tooltip from "../atoms/Tooltip";
import styles from "../../../styles/components/organisms/AppNavbar.module.scss";

interface AppNavbarProps {
    session: Session | null;
}

const AppNavbar: React.FC<AppNavbarProps> = ({ session }) => {
    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
    const pathname = usePathname();
    const navItemClass = (isActive: boolean) => `btn btn-ghost ${isActive ? styles.active : ""}`;

    const [openFlyout, setOpenFlyout] = useState<boolean>(false);
    const flyoutRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // Guard clause: Only add the listener if the flyout is open
        if (!openFlyout) return;

        const handleClickOutside = (event: MouseEvent) => {
            // Check if the click happened outside the flyout element
            if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
            setOpenFlyout(false); // Close it
            }
        };

        // Attach listener to the whole document
        document.addEventListener('mousedown', handleClickOutside);

        // Clean up the listener when the flyout closes or unmounts
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [openFlyout]);

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
                        {session ? (
                            <div className={styles.flyoutAnchor} ref = {flyoutRef}>
                                <IconButton
                                    icon={<img 
                                        src={session.user.image ?? undefined}
                                        alt={session.user.name ?? "User avatar"} 
                                        title={session.user.name ?? "Account"}
                                    />}
                                    ariaLabel="User avatar"
                                    onClick={() => setOpenFlyout(true)}
                                    variant="filled"
                                    tooltip="Profile"
                                    tooltipAlign="center"
                                />
                                {openFlyout && (
                                    <div className={styles.flyout}>
                                        {/* Left Avatar, Right Info */}
                                        <div className={styles.flyoutHeader}>
                                            {session?.user?.image ? (
                                                <img 
                                                    src={session.user.image}
                                                    alt={session.user.name ?? "User avatar"} 
                                                    title={session.user.name ?? "Account"}
                                                    className={styles.flyoutAvatar}
                                                />
                                            ) : (
                                                <div className={styles.flyoutAvatarFallback}>
                                                    {session?.user?.name?.[0] ?? "U"}
                                                </div>
                                            )}
                                            <div className={styles.flyoutInfo}>
                                                <span className={styles.welcome}>Hi, {session?.user?.name}</span>
                                                <span className={styles.flyoutEmail}>{session?.user?.email}</span>
                                                <span className={styles.flyoutRole}>
                                                    {session?.user?.role === "SUPER_ADMIN" ? "Super Admin" :
                                                    session?.user?.role === "ADMIN" ? "Admin" : "User"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Separator */}
                                        <hr className={styles.flyoutSeparator} />

                                        {/* Sign Out button */}
                                        <button 
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

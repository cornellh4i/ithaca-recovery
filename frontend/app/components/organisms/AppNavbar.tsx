"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../atoms/Logo";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "../atoms/Tooltip";
import { useSidebar } from "../../context/SidebarContext";
import styles from "../../../styles/components/organisms/AppNavbar.module.scss";

interface AppNavbarProps {
    session: Session | null;
}

const AppNavbar: React.FC<AppNavbarProps> = ({ session }) => {
    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
    const pathname = usePathname();
    const navItemClass = (isActive: boolean) => `btn btn-ghost ${isActive ? styles.active : ""}`;
    const { isSidebarOpen, toggleSidebar } = useSidebar();

    return (
        <div className={styles.navbar}>
            <div className={styles.navcontainer}>
                <div className={styles.navLeft}>
                    <Tooltip content="Show/Hide calendar sidebar" align="left">
                        <IconButton
                            className={styles.sidebarToggleButton}
                            onClick={toggleSidebar}
                            aria-label={isSidebarOpen ? "Hide calendar sidebar" : "Show calendar sidebar"}
                        >
                            <img src="/svg/menu-icon.svg" alt="" className={styles.menuIcon} />
                        </IconButton>
                    </Tooltip>
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
                            <div className={styles.accountGroup}>
                                <span className={styles.welcome}>Welcome, {session.user?.name}</span>
                                <button onClick={() => signOut({ callbackUrl: "/" })}>
                                    <p>Sign Out</p>
                                </button>
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

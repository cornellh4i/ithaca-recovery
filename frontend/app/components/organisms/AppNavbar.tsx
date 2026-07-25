"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../atoms/Logo";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import IconButton from "@mui/material/IconButton";
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
                    <span className={styles.sidebarToggleWrapper}>
                        <IconButton
                            className={styles.sidebarToggleButton}
                            onClick={toggleSidebar}
                            aria-label={isSidebarOpen ? "Hide calendar sidebar" : "Show calendar sidebar"}
                        >
                            <img src="/svg/menu-icon.svg" alt="" className={styles.menuIcon} />
                        </IconButton>
                        <span className={styles.tooltip}>
                            Show/Hide calendar sidebar
                        </span>
                    </span>
                    <Logo />
                </div>
                <ul className={styles.navigationlist}>
                    <li className={`${navItemClass(pathname === "/")} ${styles.navTooltipWrapper}`}>
                        <Link href="/">
                            <p>Main Calendar</p>
                        </Link>
                        <span className={styles.tooltip}>
                            Live calendar — add, edit, or delete meetings
                        </span>
                    </li>
                    <li className={`${navItemClass(pathname === "/signage")} ${styles.navTooltipWrapper}`}>
                        <Link href="/signage">
                            <p>Signage</p>
                        </Link>
                        <span className={styles.tooltip}>
                            Read-only calendar view for signage
                        </span>
                    </li>
                    <li className={`${navItemClass(pathname?.startsWith("/admin") ?? false)} ${styles.navTooltipWrapper}`}>
                        {isAdmin ? (
                            <>
                                <Link href="/admin">
                                    <p>Admin</p>
                                </Link>
                                <span className={styles.tooltip}>
                                    Manage users, imports, exports, and diagnostics
                                </span>
                            </>
                        ) : session ? (
                            <>
                                <button className={styles.navLocked} disabled>
                                    <p>Admin</p>
                                    <img src="/svg/lock-icon.svg" alt="" className={styles.lockIcon} />
                                </button>
                                <span className={styles.tooltip}>Requires admin access</span>
                            </>
                        ) : (
                            <>
                                <Link href="/login" className={styles.navLockedLink}>
                                    <p>Admin</p>
                                    <img src="/svg/lock-icon.svg" alt="" className={styles.lockIcon} />
                                </Link>
                                <span className={styles.tooltip}>Sign in to access Admin</span>
                            </>
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

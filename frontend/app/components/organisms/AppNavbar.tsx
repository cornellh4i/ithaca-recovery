"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../atoms/Logo";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import styles from "../../../styles/components/organisms/AppNavbar.module.scss";

interface AppNavbarProps {
    session: Session | null;
}

const AppNavbar: React.FC<AppNavbarProps> = ({ session }) => {
    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
    const pathname = usePathname();
    const navItemClass = (isActive: boolean) => `btn btn-ghost ${isActive ? styles.active : ""}`;

    return (
        <div className={styles.navbar}>
            <div className={styles.navcontainer}>
                <Logo />
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
                        ) : (
                            <>
                                <button className={styles.navLocked} disabled>
                                    <p>Admin</p>
                                    <img src="/svg/lock-icon.svg" alt="" className={styles.lockIcon} />
                                </button>
                                <span className={styles.tooltip}>Requires admin access</span>
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
                            <a className={styles.signInButton} href="/api/auth/signin/google">
                                <p>Sign In</p>
                            </a>
                        )}
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default AppNavbar;

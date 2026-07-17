"use client";

import React from "react";
import Link from "next/link";
import Logo from "../atoms/Logo";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import styles from "../../../styles/components/organisms/AppNavbar.module.scss";

interface AppNavbarProps {
    session: Session | null;
}

const AppNavbar: React.FC<AppNavbarProps> = ({ session }) => {
    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";

    return (
        <div className={styles.navbar}>
            <div className={styles.navcontainer}>
                <Logo />
                <ul className={styles.navigationlist}>
                    <li className="btn btn-ghost">
                        <Link href="/">
                            <p>Main</p>
                        </Link>
                    </li>
                    <li className="btn btn-ghost">
                        <Link href="/signage">
                            <p>Signage</p>
                        </Link>
                    </li>
                    <li className={`btn btn-ghost ${!isAdmin ? styles.navLockedWrapper : ""}`}>
                        {isAdmin ? (
                            <Link href="/admin">
                                <p>Admin</p>
                            </Link>
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

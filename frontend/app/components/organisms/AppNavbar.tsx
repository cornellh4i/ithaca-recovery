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
    return (
        <>
            <div className={styles.navbar}>
                <div className={styles.navcontainer}>
                    <Logo />
                    <ul className={styles.navigationlist}>
                        {!session && (
                            <li className="btn btn-ghost">
                                <a href="/api/auth/signin/google">
                                    <p>Sign In</p>
                                </a>
                            </li>
                        )}
                        {session && (
                            <li className="btn btn-ghost">
                                <button onClick={() => signOut({ callbackUrl: "/" })}>
                                    <p>Sign Out</p>
                                </button>
                            </li>
                        )}
                    </ul>
                    {session?.user && (
                        <div className={styles.welcome}>
                            <p>Welcome, {session.user.name}</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default AppNavbar;
